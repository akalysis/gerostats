#!/usr/bin/env python3
"""Build calibrated station-local healthy life expectancy estimates.

The estimates are synthetic small-area predictions. They borrow information
from official county/unitary-authority HLE, current MSOA life expectancy and
Census 2021 health, disability, age and sex structure. Station values are then
calibrated so the population-weighted MSOA mean reproduces the official
county/unitary-authority HLE for each sex.
"""

from __future__ import annotations

import json
import math
import re
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / ".cache" / "metro-hle"
OUT_DIR = ROOT / "stories" / "metro-healthy-life-expectancy" / "data"
MAP_REFERENCE_PATH = OUT_DIR / "metro-life-expectancy-map-reference.json"
MAP_DATA_PATH = OUT_DIR / "station-hle-map-data.json"

FINGERTIPS_MSOA_LE_URL = (
    "https://fingertips.phe.org.uk/api/all_data/csv/"
    "by_indicator_id?indicator_ids=93283&child_area_type_id=3"
)
FINGERTIPS_HLE_URL = (
    "https://fingertips.phe.org.uk/api/all_data/csv/"
    "by_indicator_id?indicator_ids=90362&child_area_type_id=502"
)
CTYUA_LOOKUP_URL = (
    "https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/"
    "items/15abc3e5a1d8478a981d9cc512e8fb35/csv?layers=0"
)
NAPTAN_URL = "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv"
MSOA_QUERY_URL = (
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
    "Middle_layer_Super_Output_Areas_December_2021_Boundaries_EW_BGC_V3/"
    "FeatureServer/0/query"
)

CENSUS_URL_TEMPLATE = (
    "https://www.nomisweb.co.uk/output/census/2021/census2021-{code}.zip"
)

FEATURES = [
    "life_expectancy",
    "good_health_rate",
    "bad_health_rate",
    "disabled_rate",
    "limited_lot_rate",
    "no_ltc_rate",
    "age0_15_rate",
    "age65plus_rate",
    "age85plus_rate",
    "sex_share",
]

ONS_DEPRIVATION_HLE = {
    "Male": {
        "d1": 49.8,
        "d10": 69.2,
        "sii": 19.3,
        "source": "ONS HLE by national area deprivation, England, 2022 to 2024",
    },
    "Female": {
        "d1": 48.2,
        "d10": 68.5,
        "sii": 20.1,
        "source": "ONS HLE by national area deprivation, England, 2022 to 2024",
    },
}
DEPRIVATION_PRIOR_SD = 1.0
STRUCTURAL_UNCERTAINTY_SD = 2.0


def download(url: str, filename: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / filename
    if not path.exists() or path.stat().st_size == 0:
        with urllib.request.urlopen(url, timeout=120) as response:
            path.write_bytes(response.read())
    return path


def read_csv(url: str, filename: str, **kwargs) -> pd.DataFrame:
    return pd.read_csv(download(url, filename), **kwargs)


def read_census_table(code: str) -> pd.DataFrame:
    zip_path = download(CENSUS_URL_TEMPLATE.format(code=code), f"census2021-{code}.zip")
    member = f"census2021-{code}-msoa.csv"
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(member) as handle:
            return pd.read_csv(handle).rename(
                columns={"geography code": "msoa_code", "geography": "msoa_name"}
            )


def require_columns(df: pd.DataFrame, columns: list[str], source: str) -> None:
    missing = [column for column in columns if column not in df.columns]
    if missing:
        raise ValueError(f"{source} is missing required columns: {missing}")


def build_msoa_covariates() -> pd.DataFrame:
    ts037 = read_census_table("ts037")
    ts038 = read_census_table("ts038")
    ts007 = read_census_table("ts007")
    ts008 = read_census_table("ts008")

    base = ts037.copy()
    for table in [ts038, ts007, ts008]:
        base = base.merge(
            table.drop(columns=["date", "msoa_name"]),
            on="msoa_code",
            how="inner",
            validate="one_to_one",
        )

    required = [
        "General health: Total: All usual residents",
        "General health: Very good health",
        "General health: Good health",
        "General health: Bad health",
        "General health: Very bad health",
        "Disability: Total: All usual residents",
        "Disability: Disabled under the Equality Act",
        "Disability: Disabled under the Equality Act: Day-to-day activities limited a lot",
        "Disability: Not disabled under the Equality Act: No long term physical or mental health conditions",
        "Age: Total; measures: Value",
        "Sex: All persons; measures: Value",
        "Sex: Male; measures: Value",
        "Sex: Female; measures: Value",
    ]
    require_columns(base, required, "Census MSOA tables")

    cov = pd.DataFrame({"msoa_code": base["msoa_code"], "msoa_name": base["msoa_name"]})
    cov["health_total"] = base["General health: Total: All usual residents"]
    cov["good_health_count"] = (
        base["General health: Very good health"] + base["General health: Good health"]
    )
    cov["bad_health_count"] = (
        base["General health: Bad health"] + base["General health: Very bad health"]
    )
    cov["good_health_rate"] = cov["good_health_count"] / cov["health_total"]
    cov["bad_health_rate"] = cov["bad_health_count"] / cov["health_total"]

    cov["disability_total"] = base["Disability: Total: All usual residents"]
    cov["disabled_count"] = base["Disability: Disabled under the Equality Act"]
    cov["limited_lot_count"] = base[
        "Disability: Disabled under the Equality Act: Day-to-day activities limited a lot"
    ]
    cov["no_ltc_count"] = base[
        "Disability: Not disabled under the Equality Act: No long term physical or mental health conditions"
    ]
    cov["disabled_rate"] = cov["disabled_count"] / cov["disability_total"]
    cov["limited_lot_rate"] = cov["limited_lot_count"] / cov["disability_total"]
    cov["no_ltc_rate"] = cov["no_ltc_count"] / cov["disability_total"]

    cov["age_total"] = base["Age: Total; measures: Value"]
    age_groups = {
        "age0_15_count": [
            "Age: Aged 4 years and under; measures: Value",
            "Age: Aged 5 to 9 years; measures: Value",
            "Age: Aged 10 to 15 years; measures: Value",
        ],
        "age16_64_count": [
            "Age: Aged 16 to 19 years; measures: Value",
            "Age: Aged 20 to 24 years; measures: Value",
            "Age: Aged 25 to 34 years; measures: Value",
            "Age: Aged 35 to 49 years; measures: Value",
            "Age: Aged 50 to 64 years; measures: Value",
        ],
        "age65plus_count": [
            "Age: Aged 65 to 74 years; measures: Value",
            "Age: Aged 75 to 84 years; measures: Value",
            "Age: Aged 85 years and over; measures: Value",
        ],
        "age85plus_count": ["Age: Aged 85 years and over; measures: Value"],
    }
    for output, columns in age_groups.items():
        require_columns(base, columns, "Census TS007")
        cov[output] = base[columns].sum(axis=1)
        cov[output.replace("_count", "_rate")] = cov[output] / cov["age_total"]

    cov["all_pop"] = base["Sex: All persons; measures: Value"]
    cov["male_pop"] = base["Sex: Male; measures: Value"]
    cov["female_pop"] = base["Sex: Female; measures: Value"]
    cov["male_share"] = cov["male_pop"] / cov["all_pop"]
    return cov


def read_ctyua_lookup() -> pd.DataFrame:
    lookup = read_csv(CTYUA_LOOKUP_URL, "msoa-2021-to-ctyua-2023.csv", encoding="utf-8-sig")
    return lookup.rename(
        columns={
            "MSOA21CD": "msoa_code",
            "UTLA23CD": "ctyua_code",
            "UTLA23NM": "ctyua_name",
        }
    )[["msoa_code", "ctyua_code", "ctyua_name"]]


def read_msoa_life_expectancy() -> pd.DataFrame:
    le = read_csv(FINGERTIPS_MSOA_LE_URL, "ohid-msoa-life-expectancy-93283.csv")
    le = le[(le["Area Type"] == "MSOA") & (le["Time period"] == "2019 - 23")].copy()
    le = le[
        [
            "Area Code",
            "Area Name",
            "Sex",
            "Value",
            "Lower CI 95.0 limit",
            "Upper CI 95.0 limit",
        ]
    ]
    le.columns = [
        "msoa_code",
        "le_area_name",
        "sex",
        "life_expectancy",
        "life_expectancy_lcl",
        "life_expectancy_ucl",
    ]
    le["life_expectancy_se"] = (
        le["life_expectancy_ucl"] - le["life_expectancy_lcl"]
    ) / (2 * 1.96)
    return le


def read_official_hle() -> pd.DataFrame:
    hle = read_csv(FINGERTIPS_HLE_URL, "ohid-ctyua-hle-90362.csv")
    hle = hle[
        (hle["Time period"] == "2022 - 24")
        & (hle["Area Type"] == "Counties & UAs (from Apr 2023)")
    ].copy()
    hle = hle[
        [
            "Area Code",
            "Area Name",
            "Sex",
            "Value",
            "Lower CI 95.0 limit",
            "Upper CI 95.0 limit",
        ]
    ]
    hle.columns = ["ctyua_code", "hle_area_name", "sex", "hle", "hle_lcl", "hle_ucl"]
    hle["hle_se"] = (hle["hle_ucl"] - hle["hle_lcl"]) / (2 * 1.96)
    return hle


def weighted_group_mean(
    df: pd.DataFrame, group_cols: list[str], value_col: str, weight_col: str, output_col: str
) -> pd.DataFrame:
    valid = df[df[value_col].notna()].copy()
    valid["_weighted_value"] = valid[value_col] * valid[weight_col]
    grouped = (
        valid.groupby(group_cols, as_index=False)
        .agg(_weighted_value=("_weighted_value", "sum"), _weight_sum=(weight_col, "sum"))
        .copy()
    )
    grouped[output_col] = grouped["_weighted_value"] / grouped["_weight_sum"]
    return grouped[group_cols + [output_col]]


def prepare_msoa_model_frame() -> pd.DataFrame:
    cov = build_msoa_covariates().merge(
        read_ctyua_lookup(), on="msoa_code", how="inner", validate="one_to_one"
    )
    frame = cov.merge(read_msoa_life_expectancy(), on="msoa_code", how="inner")
    frame["sex_pop"] = np.where(frame["sex"].eq("Male"), frame["male_pop"], frame["female_pop"])
    frame["sex_share"] = np.where(
        frame["sex"].eq("Male"), frame["male_share"], 1 - frame["male_share"]
    )
    frame["life_expectancy_imputed"] = frame["life_expectancy"].isna()

    le_mean = weighted_group_mean(
        frame, ["ctyua_code", "sex"], "life_expectancy", "sex_pop", "ctyua_le_mean"
    )
    le_se = (
        frame.dropna(subset=["life_expectancy_se"])
        .groupby(["ctyua_code", "sex"], as_index=False)["life_expectancy_se"]
        .median()
        .rename(columns={"life_expectancy_se": "ctyua_le_se"})
    )
    frame = frame.merge(le_mean, on=["ctyua_code", "sex"], how="left").merge(
        le_se, on=["ctyua_code", "sex"], how="left"
    )

    national_le_mean = frame.groupby("sex")["life_expectancy"].transform("mean")
    frame["life_expectancy_model"] = (
        frame["life_expectancy"].fillna(frame["ctyua_le_mean"]).fillna(national_le_mean)
    )
    frame["life_expectancy_se_model"] = (
        frame["life_expectancy_se"].fillna(frame["ctyua_le_se"]).fillna(frame["life_expectancy_se"].median())
    )
    return frame


def aggregate_to_ctyua(frame: pd.DataFrame) -> pd.DataFrame:
    sum_cols = [
        "health_total",
        "good_health_count",
        "bad_health_count",
        "disability_total",
        "disabled_count",
        "limited_lot_count",
        "no_ltc_count",
        "age_total",
        "age0_15_count",
        "age16_64_count",
        "age65plus_count",
        "age85plus_count",
        "all_pop",
        "male_pop",
        "female_pop",
    ]
    rows = []
    for (code, name, sex), group in frame.groupby(["ctyua_code", "ctyua_name", "sex"]):
        row = {
            "ctyua_code": code,
            "ctyua_name": name,
            "sex": sex,
            "sex_pop": group["sex_pop"].sum(),
        }
        for column in sum_cols:
            row[column] = group[column].sum()
        row["life_expectancy"] = np.average(
            group["life_expectancy_model"], weights=group["sex_pop"]
        )
        row["good_health_rate"] = row["good_health_count"] / row["health_total"]
        row["bad_health_rate"] = row["bad_health_count"] / row["health_total"]
        row["disabled_rate"] = row["disabled_count"] / row["disability_total"]
        row["limited_lot_rate"] = row["limited_lot_count"] / row["disability_total"]
        row["no_ltc_rate"] = row["no_ltc_count"] / row["disability_total"]
        row["age0_15_rate"] = row["age0_15_count"] / row["age_total"]
        row["age16_64_rate"] = row["age16_64_count"] / row["age_total"]
        row["age65plus_rate"] = row["age65plus_count"] / row["age_total"]
        row["age85plus_rate"] = row["age85plus_count"] / row["age_total"]
        row["sex_share"] = row["sex_pop"] / row["all_pop"]
        rows.append(row)
    return pd.DataFrame(rows)


def ridge_fit(x: np.ndarray, y: np.ndarray, weights: np.ndarray, penalty: float) -> np.ndarray:
    sqrt_w = np.sqrt(weights)[:, None]
    weighted_x = x * sqrt_w
    weighted_y = y * np.sqrt(weights)
    penalty_matrix = np.eye(x.shape[1])
    penalty_matrix[0, 0] = 0
    return np.linalg.solve(
        weighted_x.T @ weighted_x + penalty * penalty_matrix,
        weighted_x.T @ weighted_y,
    )


def fit_model(df: pd.DataFrame, penalty: float) -> dict[str, np.ndarray]:
    x = df[FEATURES].to_numpy(float)
    y = df["hle"].to_numpy(float)
    weights = df["sex_pop"].to_numpy(float)
    mean = np.average(x, axis=0, weights=weights)
    sd = np.sqrt(np.average((x - mean) ** 2, axis=0, weights=weights))
    sd[sd == 0] = 1
    x_scaled = np.column_stack([np.ones(len(x)), (x - mean) / sd])
    beta = ridge_fit(x_scaled, y, weights / weights.mean(), penalty)
    return {"mean": mean, "sd": sd, "beta": beta}


def predict(model: dict[str, np.ndarray], df: pd.DataFrame) -> np.ndarray:
    x = df[FEATURES].to_numpy(float)
    x_scaled = np.column_stack([np.ones(len(x)), (x - model["mean"]) / model["sd"]])
    return x_scaled @ model["beta"]


def cross_validate(train: pd.DataFrame, sex: str) -> tuple[float, float, float, np.ndarray]:
    data = train[train["sex"] == sex].reset_index(drop=True)
    rng = np.random.default_rng(1729)
    indices = np.arange(len(data))
    rng.shuffle(indices)
    folds = np.array_split(indices, 10)
    penalties = np.array([0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 300], float)

    best: tuple[float, float, float, np.ndarray] | None = None
    for penalty in penalties:
        predictions = np.empty(len(data))
        for fold in folds:
            model = fit_model(data.drop(index=fold), penalty)
            predictions[fold] = predict(model, data.iloc[fold])
        errors = predictions - data["hle"].to_numpy(float)
        rmse = math.sqrt(np.average(errors**2, weights=data["sex_pop"]))
        mae = np.average(np.abs(errors), weights=data["sex_pop"])
        if best is None or rmse < best[1]:
            best = (float(penalty), float(rmse), float(mae), predictions)
    assert best is not None
    return best


def station_to_msoa(longitude: float, latitude: float) -> str | None:
    params = {
        "f": "json",
        "where": "1=1",
        "outFields": "MSOA21CD,MSOA21NM",
        "returnGeometry": "false",
        "geometry": f"{longitude},{latitude}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
    }
    url = MSOA_QUERY_URL + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))
    features = data.get("features", [])
    if not features:
        return None
    return features[0]["attributes"]["MSOA21CD"]


def read_metro_stations() -> pd.DataFrame:
    stations = read_csv(NAPTAN_URL, "naptan-access-nodes.csv", low_memory=False)
    stations = stations[
        (stations["StopType"] == "MET")
        & (stations["Longitude"].between(-2.2, -1.0))
        & (stations["Latitude"].between(54.7, 55.3))
    ].copy()
    if "Status" in stations.columns:
        stations = stations[stations["Status"].fillna("").str.lower().ne("deleted")]
    stations["msoa_code"] = [
        station_to_msoa(row.Longitude, row.Latitude) for row in stations.itertuples()
    ]
    stations["station_name"] = stations["CommonName"].str.replace(
        r" \(Tyne (and|&) Wear Metro Station\)", "", regex=True
    )
    stations["station_name"] = stations["station_name"].str.replace(" Of ", " of ", regex=False)
    return stations


def build_predictions(
    frame: pd.DataFrame, hle: pd.DataFrame, diagnostics: list[dict], models: dict[str, dict]
) -> tuple[pd.DataFrame, float]:
    model_frame = frame.copy()
    model_frame["life_expectancy"] = model_frame["life_expectancy_model"]
    model_frame["life_expectancy_se"] = model_frame["life_expectancy_se_model"]
    parts = []

    for sex in ["Male", "Female"]:
        sex_frame = model_frame[model_frame["sex"] == sex].copy()
        sex_frame["raw_hle"] = predict(models[sex], sex_frame)
        raw_means = weighted_group_mean(
            sex_frame, ["ctyua_code"], "raw_hle", "sex_pop", "raw_ctyua_mean"
        )
        targets = hle[hle["sex"] == sex][["ctyua_code", "hle", "hle_se"]]
        sex_frame = sex_frame.merge(raw_means, on="ctyua_code").merge(
            targets, on="ctyua_code"
        )
        sex_frame["hle_estimate"] = sex_frame["hle"] + (
            sex_frame["raw_hle"] - sex_frame["raw_ctyua_mean"]
        )

        diag = next(item for item in diagnostics if item["sex"] == sex)
        imputation_extra = np.where(
            sex_frame["life_expectancy_imputed"], diag["cv_rmse"], 0
        )
        sex_frame["model_se"] = np.sqrt(
            diag["cv_rmse"] ** 2
            + sex_frame["hle_se"] ** 2
            + (diag["life_expectancy_coef"] * sex_frame["life_expectancy_se"]) ** 2
            + imputation_extra**2
        )
        sex_frame["hle_low95"] = sex_frame["hle_estimate"] - 1.96 * sex_frame["model_se"]
        sex_frame["hle_high95"] = sex_frame["hle_estimate"] + 1.96 * sex_frame["model_se"]
        parts.append(sex_frame)

    predictions = pd.concat(parts, ignore_index=True)
    calibration_errors = []
    for _, group in predictions.groupby(["ctyua_code", "sex"]):
        weighted_mean = np.average(group["hle_estimate"], weights=group["sex_pop"])
        calibration_errors.append(abs(weighted_mean - group["hle"].iloc[0]))
    return predictions, float(max(calibration_errors))


def attach_station_estimates(stations: pd.DataFrame, frame: pd.DataFrame, predictions: pd.DataFrame) -> pd.DataFrame:
    station_frame = stations[
        ["ATCOCode", "station_name", "CommonName", "Longitude", "Latitude", "msoa_code"]
    ].rename(
        columns={
            "ATCOCode": "atco_code",
            "CommonName": "naptan_common_name",
            "Longitude": "longitude",
            "Latitude": "latitude",
        }
    )
    geography = frame[
        ["msoa_code", "msoa_name", "ctyua_code", "ctyua_name"]
    ].drop_duplicates()
    station_frame = station_frame.merge(geography, on="msoa_code", how="left")

    estimate_cols = [
        "msoa_code",
        "hle_estimate",
        "hle_low95",
        "hle_high95",
        "model_se",
        "life_expectancy",
        "life_expectancy_imputed",
        "good_health_rate",
        "disabled_rate",
        "hle",
    ]
    for sex in ["Male", "Female"]:
        estimates = (
            predictions[predictions["sex"] == sex][estimate_cols]
            .add_prefix(f"{sex.lower()}_")
            .rename(columns={f"{sex.lower()}_msoa_code": "msoa_code"})
        )
        station_frame = station_frame.merge(estimates, on="msoa_code", how="left")
    return station_frame.sort_values("station_name")


def rounded_records(df: pd.DataFrame) -> list[dict]:
    rounded = df.copy()
    for column in rounded.select_dtypes(include=[np.number]).columns:
        rounded[column] = rounded[column].round(3)
    return rounded.where(pd.notna(rounded), None).to_dict(orient="records")


def ons_deprivation_prior(sex: str, decile: float) -> float:
    benchmark = ONS_DEPRIVATION_HLE[sex]
    return benchmark["d1"] + (decile - 1) * (benchmark["d10"] - benchmark["d1"]) / 9


def station_lookup_name(station: str) -> str:
    aliases = {
        "Airport": "Newcastle Airport",
        "Stadium Of Light": "Stadium of Light",
    }
    return aliases.get(station, station)


def write_map_data(station_estimates: pd.DataFrame) -> dict:
    if not MAP_REFERENCE_PATH.exists():
        return {
            "written": False,
            "reason": f"Map reference not found: {MAP_REFERENCE_PATH}",
        }

    reference = json.loads(MAP_REFERENCE_PATH.read_text(encoding="utf-8"))
    source_stations = reference["stations"]
    estimates_by_station = {
        row.station_name: row for row in station_estimates.itertuples(index=False)
    }

    rows = []
    missing = []
    for source in source_stations:
        hle_name = station_lookup_name(source["station"])
        estimate = estimates_by_station.get(hle_name)
        if estimate is None:
            missing.append({"station": source["station"], "lookup_station": hle_name})
            continue

        rows.append(
            {
                "station": source["station"],
                "hle_station_name": hle_name,
                "x": source["x"],
                "y": source["y"],
                "pointX": source.get("pointX"),
                "pointY": source.get("pointY"),
                "msoaCode": source.get("msoaCode"),
                "msoaName": source.get("msoaName"),
                "lsoaCode": source.get("lsoaCode"),
                "lsoaName": source.get("lsoaName"),
                "imdDecile": source.get("imdDecile"),
                "imdRank": source.get("imdRank"),
                "imdScore": source.get("imdScore"),
                "healthDeprivationDecile": source.get("healthDeprivationDecile"),
                "ctyuaCode": estimate.ctyua_code,
                "ctyuaName": estimate.ctyua_name,
                "maleRawHle": estimate.male_hle_estimate,
                "femaleRawHle": estimate.female_hle_estimate,
                "maleRawSe": estimate.male_model_se,
                "femaleRawSe": estimate.female_model_se,
                "maleAuthorityHle": estimate.male_hle,
                "femaleAuthorityHle": estimate.female_hle,
                "maleLifeExpectancy": estimate.male_life_expectancy,
                "femaleLifeExpectancy": estimate.female_life_expectancy,
                "maleGoodHealthRate": estimate.male_good_health_rate,
                "femaleGoodHealthRate": estimate.female_good_health_rate,
                "maleDisabledRate": estimate.male_disabled_rate,
                "femaleDisabledRate": estimate.female_disabled_rate,
            }
        )

    map_frame = pd.DataFrame(rows)
    for sex, prefix in [("Male", "male"), ("Female", "female")]:
        prior_col = f"{prefix}OnsDeprivationPrior"
        centered_prior_col = f"{prefix}CenteredPrior"
        posterior_col = f"{prefix}PosteriorPrecenter"
        estimate_col = f"{prefix}Hle"
        se_col = f"{prefix}PosteriorSe"
        interval_se_col = f"{prefix}IntervalSe"
        low_col = f"{prefix}Low95"
        high_col = f"{prefix}High95"
        raw_col = f"{prefix}RawHle"
        raw_se_col = f"{prefix}RawSe"
        authority_col = f"{prefix}AuthorityHle"

        map_frame[prior_col] = map_frame["imdDecile"].apply(
            lambda decile: ons_deprivation_prior(sex, decile)
        )
        map_frame[centered_prior_col] = map_frame[authority_col] + (
            map_frame[prior_col] - map_frame.groupby("ctyuaName")[prior_col].transform("mean")
        )

        raw_var = map_frame[raw_se_col] ** 2
        prior_var = DEPRIVATION_PRIOR_SD**2
        map_frame[posterior_col] = (
            map_frame[raw_col] / raw_var + map_frame[centered_prior_col] / prior_var
        ) / (1 / raw_var + 1 / prior_var)
        map_frame[se_col] = np.sqrt(1 / (1 / raw_var + 1 / prior_var))
        map_frame[estimate_col] = map_frame[authority_col] + (
            map_frame[posterior_col]
            - map_frame.groupby("ctyuaName")[posterior_col].transform("mean")
        )
        map_frame[interval_se_col] = np.sqrt(
            map_frame[se_col] ** 2 + STRUCTURAL_UNCERTAINTY_SD**2
        )
        map_frame[low_col] = map_frame[estimate_col] - 1.96 * map_frame[interval_se_col]
        map_frame[high_col] = map_frame[estimate_col] + 1.96 * map_frame[interval_se_col]

    stations = []
    for record in rounded_records(map_frame):
        stations.append(
            {
                "station": record["station"],
                "hleStationName": record["hle_station_name"],
                "x": record["x"],
                "y": record["y"],
                "pointX": record["pointX"],
                "pointY": record["pointY"],
                "msoaCode": record["msoaCode"],
                "msoaName": record["msoaName"],
                "lsoaCode": record["lsoaCode"],
                "lsoaName": record["lsoaName"],
                "imdDecile": record["imdDecile"],
                "imdRank": record["imdRank"],
                "imdScore": record["imdScore"],
                "healthDeprivationDecile": record["healthDeprivationDecile"],
                "ctyuaCode": record["ctyuaCode"],
                "ctyuaName": record["ctyuaName"],
                "male": {
                    "hle": record["maleHle"],
                    "low95": record["maleLow95"],
                    "high95": record["maleHigh95"],
                    "posteriorSe": record["malePosteriorSe"],
                    "intervalSe": record["maleIntervalSe"],
                    "rawModelHle": record["maleRawHle"],
                    "onsDeprivationPrior": record["maleOnsDeprivationPrior"],
                    "centeredPrior": record["maleCenteredPrior"],
                    "authorityHle": record["maleAuthorityHle"],
                    "lifeExpectancy": record["maleLifeExpectancy"],
                    "goodHealthRate": record["maleGoodHealthRate"],
                    "disabledRate": record["maleDisabledRate"],
                },
                "female": {
                    "hle": record["femaleHle"],
                    "low95": record["femaleLow95"],
                    "high95": record["femaleHigh95"],
                    "posteriorSe": record["femalePosteriorSe"],
                    "intervalSe": record["femaleIntervalSe"],
                    "rawModelHle": record["femaleRawHle"],
                    "onsDeprivationPrior": record["femaleOnsDeprivationPrior"],
                    "centeredPrior": record["femaleCenteredPrior"],
                    "authorityHle": record["femaleAuthorityHle"],
                    "lifeExpectancy": record["femaleLifeExpectancy"],
                    "goodHealthRate": record["femaleGoodHealthRate"],
                    "disabledRate": record["femaleDisabledRate"],
                },
            }
        )

    def summary_for(prefix: str) -> dict:
        value_col = f"{prefix}Hle"
        low = map_frame.loc[map_frame[value_col].idxmin()]
        high = map_frame.loc[map_frame[value_col].idxmax()]
        return {
            "min": float(map_frame[value_col].min()),
            "max": float(map_frame[value_col].max()),
            "gap": float(map_frame[value_col].max() - map_frame[value_col].min()),
            "lowestStation": low["station"],
            "highestStation": high["station"],
        }

    excluded_from_map = sorted(
        set(station_estimates["station_name"]) - {station_lookup_name(item["station"]) for item in source_stations}
    )
    summary = {
        "written": True,
        "station_count": int(len(stations)),
        "missing_reference_matches": missing,
        "excluded_from_map": excluded_from_map,
        "male": summary_for("male"),
        "female": summary_for("female"),
        "bayesian_borrowing": {
            "likelihood": "Calibrated covariate model fitted to official authority HLE and projected to station MSOAs",
            "prior": "ONS England 2022 to 2024 HLE deprivation decile gradient, centred within each authority",
            "deprivation_prior_sd_years": DEPRIVATION_PRIOR_SD,
            "structural_uncertainty_sd_years": STRUCTURAL_UNCERTAINTY_SD,
            "map_display_calibration": "Posterior station estimates are centred within authority for the mapped station set",
        },
    }

    payload = {
        "measure": "Bayesian-borrowed station-local healthy life expectancy at birth",
        "map": {"x": 64, "y": 244, "width": 1310, "height": 618},
        "sourceReference": MAP_REFERENCE_PATH.name,
        "onsDeprivationHle": ONS_DEPRIVATION_HLE,
        "summary": summary,
        "stations": stations,
    }
    MAP_DATA_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return summary


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    msoa_frame = prepare_msoa_model_frame()
    ctyua = aggregate_to_ctyua(msoa_frame)
    official_hle = read_official_hle()
    train = ctyua.merge(official_hle, on=["ctyua_code", "sex"], how="inner")
    train = train.dropna(subset=["hle", *FEATURES]).copy()

    diagnostics = []
    models = {}
    for sex in ["Male", "Female"]:
        penalty, rmse, mae, _ = cross_validate(train, sex)
        model = fit_model(train[train["sex"] == sex], penalty)
        coefficients = pd.Series(model["beta"][1:] / model["sd"], index=FEATURES)
        models[sex] = model
        diagnostics.append(
            {
                "sex": sex,
                "lambda": penalty,
                "cv_rmse": rmse,
                "cv_mae": mae,
                "n_authorities": int((train["sex"] == sex).sum()),
                "life_expectancy_coef": float(coefficients["life_expectancy"]),
                "coefficients": {key: float(value) for key, value in coefficients.items()},
            }
        )

    predictions, max_calibration_error = build_predictions(
        msoa_frame, official_hle, diagnostics, models
    )
    stations = read_metro_stations()
    station_estimates = attach_station_estimates(stations, msoa_frame, predictions)
    map_summary = write_map_data(station_estimates)

    csv_path = OUT_DIR / "station-hle-estimates.csv"
    station_estimates.round(3).to_csv(csv_path, index=False)

    station_json_path = OUT_DIR / "station-hle-estimates.json"
    station_json_path.write_text(
        json.dumps(rounded_records(station_estimates), indent=2), encoding="utf-8"
    )

    summary = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "measure": "Modelled station-local healthy life expectancy at birth",
        "training_authorities": {
            sex: int((train["sex"] == sex).sum()) for sex in ["Male", "Female"]
        },
        "features": FEATURES,
        "diagnostics": diagnostics,
        "validation": {
            "station_count": int(len(station_estimates)),
            "unmatched_station_count": int(station_estimates["msoa_code"].isna().sum()),
            "max_authority_calibration_error_years": max_calibration_error,
            "male_station_range": [
                float(station_estimates["male_hle_estimate"].min()),
                float(station_estimates["male_hle_estimate"].max()),
            ],
            "female_station_range": [
                float(station_estimates["female_hle_estimate"].min()),
                float(station_estimates["female_hle_estimate"].max()),
            ],
            "male_station_life_expectancy_imputed_count": int(
                station_estimates["male_life_expectancy_imputed"].sum()
            ),
            "female_station_life_expectancy_imputed_count": int(
                station_estimates["female_life_expectancy_imputed"].sum()
            ),
        },
        "map_display": map_summary,
        "source_urls": {
            "ohid_msoa_life_expectancy": FINGERTIPS_MSOA_LE_URL,
            "ohid_ctyua_healthy_life_expectancy": FINGERTIPS_HLE_URL,
            "nomis_census_bulk_template": CENSUS_URL_TEMPLATE,
            "ons_msoa_to_ctyua_lookup": CTYUA_LOOKUP_URL,
            "dft_naptan_access_nodes": NAPTAN_URL,
            "ons_msoa_boundary_query": MSOA_QUERY_URL,
        },
    }
    (OUT_DIR / "model-diagnostics.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )

    print(f"Wrote {csv_path}")
    print(f"Wrote {station_json_path}")
    if map_summary.get("written"):
        print(f"Wrote {MAP_DATA_PATH}")
    print(f"Wrote {OUT_DIR / 'model-diagnostics.json'}")
    print(
        "First-stage male range: "
        f"{summary['validation']['male_station_range'][0]:.1f}-"
        f"{summary['validation']['male_station_range'][1]:.1f}; "
        "first-stage female range: "
        f"{summary['validation']['female_station_range'][0]:.1f}-"
        f"{summary['validation']['female_station_range'][1]:.1f}"
    )
    if map_summary.get("written"):
        print(
            "Map-display male range: "
            f"{map_summary['male']['min']:.1f}-{map_summary['male']['max']:.1f}; "
            "map-display female range: "
            f"{map_summary['female']['min']:.1f}-{map_summary['female']['max']:.1f}"
        )


if __name__ == "__main__":
    main()

(() => {
  const numberFormatter = new Intl.NumberFormat("en-GB");
  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function appendPublicationCopy(parent, publication) {
    const copy = document.createElement("div");
    copy.className = "publication-copy";

    const title = document.createElement("a");
    title.className = "publication-title";
    title.href = publication.scholarUrl;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = publication.title;
    copy.append(title);

    const details = document.createElement("p");
    details.className = "publication-details";

    for (const value of [publication.authors, publication.venue, publication.year]) {
      if (!value) continue;
      const detail = document.createElement("span");
      detail.textContent = value;
      details.append(detail);
    }

    copy.append(details);
    parent.append(copy);
  }

  function appendCitationCount(parent, publication) {
    const citations = document.createElement("a");
    citations.className = "citation-count";
    citations.href = publication.citationsUrl;
    citations.target = "_blank";
    citations.rel = "noopener noreferrer";
    citations.setAttribute(
      "aria-label",
      `${numberFormatter.format(publication.citations)} citations for ${publication.title}`,
    );

    const count = document.createElement("strong");
    count.textContent = numberFormatter.format(publication.citations);
    citations.append(count, document.createTextNode(publication.citations === 1 ? " citation" : " citations"));
    parent.append(citations);
  }

  function renderMetrics(data) {
    const values = [
      data.metrics.citations.all,
      data.metrics.citations.since2021,
      data.metrics.hIndex.all,
      data.publicationCount,
    ];
    const metricElements = document.querySelectorAll("#publication-metrics dd");

    metricElements.forEach((element, index) => {
      element.textContent = numberFormatter.format(values[index]);
    });

    const refreshedDate = new Date(data.refreshedAt);
    document.querySelector("#snapshot-date").textContent =
      `Google Scholar snapshot refreshed ${dateFormatter.format(refreshedDate)}.`;
  }

  function renderTopPublications(publications) {
    const list = document.querySelector("#top-publications-list");
    list.replaceChildren();

    const topTen = [...publications]
      .sort((a, b) => b.citations - a.citations || (b.year ?? 0) - (a.year ?? 0))
      .slice(0, 10);

    for (const publication of topTen) {
      const item = document.createElement("li");
      appendPublicationCopy(item, publication);
      appendCitationCount(item, publication);
      list.append(item);
    }
  }

  function renderArchive(publications) {
    const archive = document.querySelector("#publication-archive");
    const navigation = document.querySelector("#year-navigation");
    const publicationsByYear = new Map();

    for (const publication of publications) {
      const label = publication.year ? String(publication.year) : "Undated";
      const group = publicationsByYear.get(label) ?? [];
      group.push(publication);
      publicationsByYear.set(label, group);
    }

    archive.replaceChildren();
    navigation.replaceChildren();

    for (const [year, yearPublications] of publicationsByYear) {
      const sectionId = `publications-${year.toLowerCase()}`;
      const yearLink = document.createElement("a");
      yearLink.href = `#${sectionId}`;
      yearLink.textContent = year;
      navigation.append(yearLink);

      const section = document.createElement("section");
      section.className = "publication-year";
      section.id = sectionId;
      section.setAttribute("aria-labelledby", `${sectionId}-title`);

      const title = document.createElement("h3");
      title.id = `${sectionId}-title`;
      title.textContent = year;
      section.append(title);

      const list = document.createElement("ol");
      list.className = "year-publications";

      for (const publication of yearPublications) {
        const item = document.createElement("li");
        appendPublicationCopy(item, publication);
        appendCitationCount(item, publication);
        list.append(item);
      }

      section.append(list);
      archive.append(section);
    }
  }

  function showError() {
    const message = document.createElement("p");
    message.className = "data-error";
    message.textContent =
      "The publication snapshot could not be loaded. Please use the Google Scholar link above.";

    document.querySelector("#snapshot-date").textContent = "Publication snapshot unavailable.";
    document.querySelector("#top-publications-list").replaceChildren(message.cloneNode(true));
    document.querySelector("#publication-archive").replaceChildren(message);
  }

  fetch("/data/publications.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Publication data request failed: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      renderMetrics(data);
      renderTopPublications(data.publications);
      renderArchive(data.publications);
    })
    .catch(showError);
})();

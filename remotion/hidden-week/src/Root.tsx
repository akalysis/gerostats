import {Composition} from "remotion";
import {HiddenWeekStory} from "./HiddenWeekStory";
import {
  MetroHealthyLifeExpectancyStory,
  metroHleDurationInFrames,
} from "./MetroHealthyLifeExpectancyStory";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="HiddenWeek"
        component={HiddenWeekStory}
        durationInFrames={3600}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="MetroHealthyLifeExpectancy"
        component={MetroHealthyLifeExpectancyStory}
        durationInFrames={metroHleDurationInFrames}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

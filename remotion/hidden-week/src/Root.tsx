import {Composition} from "remotion";
import {HiddenWeekStory} from "./HiddenWeekStory";

export const RemotionRoot = () => {
  return (
    <Composition
      id="HiddenWeek"
      component={HiddenWeekStory}
      durationInFrames={3600}
      fps={30}
      width={1280}
      height={720}
    />
  );
};

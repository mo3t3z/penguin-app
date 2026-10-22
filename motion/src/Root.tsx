import React from 'react';
import {Composition, Sequence, Still} from 'remotion';
import {VIDEO} from './theme';
import {PenguinPromo, SCENES, TOTAL_FRAMES} from './PenguinPromo';

// Scene-local frame each review Still shows (late enough that the scene has settled).
const STILL_FRAME = [60, 85, 125, 135, 125, 110, 119];

// A Still renders frame 0, so shift the scene's timeline back to `at`.
const frozen = (C: React.FC, at: number): React.FC => () => (
  <Sequence from={-at}>
    <C />
  </Sequence>
);

export const RemotionRoot: React.FC = () => {
  if (TOTAL_FRAMES !== VIDEO.durationInFrames) {
    throw new Error(`Promo is ${TOTAL_FRAMES} frames, expected ${VIDEO.durationInFrames}`);
  }
  return (
    <>
      <Composition id="PenguinPromo" component={PenguinPromo} durationInFrames={VIDEO.durationInFrames} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height} />
      {SCENES.map(({id, C}, i) => (
        <Still key={id} id={id} component={frozen(C, STILL_FRAME[i])} width={VIDEO.width} height={VIDEO.height} />
      ))}
    </>
  );
};

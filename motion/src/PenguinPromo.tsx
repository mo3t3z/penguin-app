import React from 'react';
import {AbsoluteFill, getStaticFiles, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {clamp} from './anim';
import {S1Hook} from './scenes/S1Hook';
import {S2Logo} from './scenes/S2Logo';
import {S3Feed} from './scenes/S3Feed';
import {S4Discover} from './scenes/S4Discover';
import {S5Chat} from './scenes/S5Chat';
import {S6Groups} from './scenes/S6Groups';
import {S7CTA} from './scenes/S7CTA';

// Nominal on-screen windows (sum 900). Each transition overlaps the next scene, so the
// outgoing scene is lengthened by the transition's length to keep cuts on these marks.
export const SCENES = [
  {id: 'Scene1', C: S1Hook, frames: 90},
  {id: 'Scene2', C: S2Logo, frames: 90},
  {id: 'Scene3', C: S3Feed, frames: 150},
  {id: 'Scene4', C: S4Discover, frames: 150},
  {id: 'Scene5', C: S5Chat, frames: 150},
  {id: 'Scene6', C: S6Groups, frames: 150},
  {id: 'Scene7', C: S7CTA, frames: 120},
] as const;
const TRANSITIONS = [10, 12, 10, 12, 10, 12];

export const TOTAL_FRAMES =
  SCENES.reduce((s, x, i) => s + x.frames + (TRANSITIONS[i] ?? 0), 0) - TRANSITIONS.reduce((a, b) => a + b, 0);

const AUDIO = 'audio/bed.mp3';
export const hasAudio = () => getStaticFiles().some((f) => f.name === AUDIO);

const Bed: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const volume = interpolate(frame, [0, 15, durationInFrames - 20, durationInFrames], [0, 1, 1, 0], clamp);
  return <Audio src={staticFile(AUDIO)} volume={volume} />;
};

export const PenguinPromo: React.FC = () => (
  <AbsoluteFill>
    <TransitionSeries>
      {SCENES.map(({id, C, frames}, i) => (
        <React.Fragment key={id}>
          <TransitionSeries.Sequence durationInFrames={frames + (TRANSITIONS[i] ?? 0)}>
            <C />
          </TransitionSeries.Sequence>
          {i < TRANSITIONS.length ? (
            <TransitionSeries.Transition
              timing={linearTiming({durationInFrames: TRANSITIONS[i]})}
              presentation={i === 0 || i === 5 ? fade() : slide({direction: 'from-right'})}
            />
          ) : null}
        </React.Fragment>
      ))}
    </TransitionSeries>
    {hasAudio() ? <Bed /> : null}
  </AbsoluteFill>
);

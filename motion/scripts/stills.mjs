// Renders the seven review Stills (Scene1..Scene7) to out/stills/.
import {execSync} from 'node:child_process';

for (let i = 1; i <= 7; i++) {
  execSync(`npx remotion still Scene${i} out/stills/scene${i}.png`, {stdio: 'inherit'});
}

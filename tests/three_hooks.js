import { registerHooks } from 'node:module';

const LIB = new URL('../web/lib/three/', import.meta.url);
const MAP = {
  three: new URL('three.module.js', LIB).href,
  'three/addons/controls/TrackballControls.js': new URL('TrackballControls.js', LIB).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(MAP, specifier)) return { url: MAP[specifier], shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

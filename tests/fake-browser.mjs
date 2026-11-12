/**
 * The small part of the browser that createGrain() touches, so lifecycle
 * tests can run in Node. WebGL calls are recorded instead of executed, and
 * animation frames only run when a test advances the clock.
 *
 * Not provided on purpose: matchMedia, document.fonts and the Resize,
 * Intersection and Mutation observers, which createGrain() treats as
 * optional. 2D canvas contexts are unavailable, so a text mask fails to set up.
 */

class FakeEventTarget {
  #listeners = new Map();

  addEventListener(type, listener) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatch(type, properties = {}) {
    const event = { type, preventDefault() {}, ...properties };
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  listenerCount() {
    let count = 0;
    for (const listeners of this.#listeners.values()) count += listeners.size;
    return count;
  }
}

class HTMLElement extends FakeEventTarget {
  style = { position: "" };
  dataset = {};
  children = [];
  parentNode = null;
  clientWidth = 800;
  clientHeight = 600;

  setAttribute() {}

  appendChild(child) {
    child.remove();
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }
}

class HTMLImageElement extends HTMLElement {
  naturalWidth = 640;
  naturalHeight = 360;
}

class HTMLVideoElement extends HTMLElement {
  videoWidth = 640;
  videoHeight = 360;
  currentTime = 0;
}

/**
 * A WebGL2 context that accepts every call. `lost` and `failSetup` let tests
 * simulate context loss and a restore that cannot rebuild its resources.
 */
function createFakeWebGl() {
  const state = {
    lost: false,
    failSetup: false,
    draws: 0,
    uploads: [],
  };
  const methods = {
    isContextLost: () => state.lost,
    getExtension: (name) =>
      name === "WEBGL_lose_context"
        ? { loseContext: () => { state.lost = true; } }
        : null,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getUniformLocation: () => ({}),
    drawArrays: () => { state.draws += 1; },
    texImage2D: (...args) => { state.uploads.push(args.at(-1)); },
  };

  return new Proxy(state, {
    get(target, property) {
      if (property in target) return target[property];
      if (property in methods) return methods[property];
      if (typeof property !== "string") return undefined;
      if (/^[A-Z0-9_]+$/.test(property)) return 0;
      if (property.startsWith("create")) {
        return () => (target.failSetup ? null : {});
      }
      return () => {};
    },
  });
}

class HTMLCanvasElement extends HTMLElement {
  width = 300;
  height = 150;
  gl = createFakeWebGl();

  getContext(type) {
    return type === "webgl2" ? this.gl : null;
  }
}

/** Installs fresh browser globals and returns handles to drive them. */
export function installFakeBrowser() {
  const canvases = [];
  const document = new FakeEventTarget();
  Object.assign(document, {
    hidden: false,
    body: new HTMLElement(),
    documentElement: new HTMLElement(),
    createElement(tag) {
      if (tag !== "canvas") return new HTMLElement();
      const canvas = new HTMLCanvasElement();
      canvases.push(canvas);
      return canvas;
    },
  });

  const window = new FakeEventTarget();
  Object.assign(window, {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
  });

  let now = 0;
  let nextFrameId = 1;
  const frameCallbacks = new Map();

  Object.assign(globalThis, {
    window,
    document,
    HTMLElement,
    HTMLCanvasElement,
    HTMLImageElement,
    HTMLVideoElement,
    getComputedStyle: (element) => ({
      position: element.style.position || "static",
    }),
    requestAnimationFrame(callback) {
      const id = nextFrameId++;
      frameCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frameCallbacks.delete(id);
    },
  });

  return {
    window,
    document,
    /** Every canvas created so far, in creation order. */
    canvases,
    createTarget: () => document.createElement("div"),
    createVideo: () => new HTMLVideoElement(),
    pendingFrames: () => frameCallbacks.size,
    /** Runs animation frames every `intervalMs` for `durationMs`. */
    advance(durationMs, intervalMs = 1_000 / 60) {
      const end = now + durationMs;
      while (now < end) {
        now += intervalMs;
        const callbacks = [...frameCallbacks.values()];
        frameCallbacks.clear();
        for (const callback of callbacks) callback(now);
      }
    },
    setHidden(hidden) {
      document.hidden = hidden;
      document.dispatch("visibilitychange");
    },
  };
}

/** The grain canvas that createGrain() appended to `target`. */
export const grainCanvasOf = (target) =>
  target.children.find((child) => child instanceof HTMLCanvasElement);

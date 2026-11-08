/**
 * D10 Success Sound Player
 * Foundry VTT module for World of Darkness 20th Edition + Dice So Nice!
 *
 * World-shared configuration: GM configures once; every client plays the same sounds locally.
 */
const MODULE_ID = "d10-success-sound-player";
const SETTING_KEY = "clientConfig";

const DEFAULT_CONFIG = {
  enabled: true,
  folder: "sounds/wod20",
  volume: 0.8,
  ownOnly: false,
  exceptionalEnabled: false,
  exceptionalThreshold: 5,
  sounds: {
    one: "", two: "", three: "", four: "", five: "",
    six: "", seven: "", eight: "", nine: "", ten: "",
    many: "", exceptional: "", failure: "", botch: ""
  }
};

const SOUND_FIELDS = [
  ["one", "1 success"],
  ["two", "2 successes"],
  ["three", "3 successes"],
  ["four", "4 successes"],
  ["five", "5 successes"],
  ["six", "6 successes"],
  ["seven", "7 successes"],
  ["eight", "8 successes"],
  ["nine", "9 successes"],
  ["ten", "10 successes"],
  ["many", "11+ successes"],
  ["exceptional", "Exceptional success"],
  ["failure", "Failure"],
  ["botch", "Botch"]
];

let seenMessageIds = new Set();

function getConfig() {
  const saved = game.settings.get(MODULE_ID, SETTING_KEY) ?? {};
  return foundry.utils.mergeObject(
    foundry.utils.deepClone(DEFAULT_CONFIG),
    saved,
    { inplace: false, insertKeys: true, overwrite: true }
  );
}

function normalizeFoundryPath(value) {
  let path = String(value ?? "").trim();
  if (!path) return "";

  // FilePicker paths are public-directory-relative. A leading slash is not
  // required by Foundry's audio API and can be interpreted as a site-root URL.
  path = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\/+/, "");

  // "Data/" is a server filesystem directory, not part of a Foundry public URL.
  // Do not silently guess at an absolute OS path.
  if (/^data\//i.test(path)) path = path.slice(5);

  return path;
}

function resolveSoundPath(config, selectedPath) {
  if (!selectedPath) return "";
  const raw = String(selectedPath).trim();

  // Keep hosted URLs and data URLs exactly as supplied.
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;

  const path = normalizeFoundryPath(raw);
  if (!path) return "";

  // A path containing a directory is already a FilePicker-style public path.
  // Only prepend the chosen root folder for a bare filename.
  if (path.includes("/")) return path;

  const folder = normalizeFoundryPath(config.folder || "").replace(/\/+$/, "");
  return folder ? `${folder}/${path}` : path;
}

function playSound(path, volume) {
  if (!path) {
    ui.notifications.warn("No sound file is assigned to this outcome.");
    return;
  }

  const src = resolveSoundPath({}, path);
  const level = Math.max(0, Math.min(1, Number(volume) || 0));

  console.info(`${MODULE_ID} | Testing/playing audio:`, src);

  try {
    // In modern Foundry versions the audio API is namespaced. The old
    // global AudioHelper alias is not guaranteed to exist in module scope.
    const AudioHelperClass =
      foundry?.audio?.AudioHelper ??
      globalThis.AudioHelper;

    if (AudioHelperClass?.play) {
      // Static AudioHelper.play supports volume and local-only playback.
      const sound = AudioHelperClass.play({
        src,
        volume: level,
        autoplay: true,
        loop: false,
        channel: "interface"
      }, false);

      // The static API may return a Sound instance (or undefined if autoplay
      // is disabled by the host). Attach diagnostics when the Sound is exposed.
      if (sound?.addEventListener) {
        sound.addEventListener("error", (event) => {
          console.error(`${MODULE_ID} | Audio playback error for "${src}"`, event);
          ui.notifications.error(`D10 Success Sound Player: failed to load "${src}". Check the path and browser console.`);
        }, { once: true });
      }
      return;
    }

    // Compatibility fallback for environments exposing only game.audio.
    // The instance API accepts a source path; volume is applied through the
    // channel's local gain, so prefer AudioHelperClass.play whenever present.
    if (game.audio?.play) {
      game.audio.play(src).catch((err) => {
        console.error(`${MODULE_ID} | Audio playback failed for "${src}"`, err);
        ui.notifications.error(`D10 Success Sound Player: could not load "${src}". Check the path and browser console.`);
      });
      return;
    }

    throw new Error("No supported Foundry audio API was found (foundry.audio.AudioHelper / game.audio.play).");
  } catch (err) {
    console.error(`${MODULE_ID} | Could not play sound "${src}"`, err);
    ui.notifications.error(`D10 Success Sound Player: audio playback failed. ${err.message || err}`);
  }
}

function parseWoD20Outcome(successArea) {
  const text = (successArea.textContent || "").replace(/\s+/g, " ").trim();
  const danger = successArea.querySelector(".danger");
  const dangerText = (danger?.textContent || "").toLowerCase();

  const botchLabel = String(game.i18n.localize("wod.dice.botch") || "botch").toLowerCase();
  const failLabel = String(game.i18n.localize("wod.dice.fail") || "fail").toLowerCase();

  if (danger && (dangerText.includes("botch") || (botchLabel && dangerText.includes(botchLabel)))) {
    return { type: "botch", successes: 0 };
  }
  if (danger && (dangerText.includes("fail") || (failLabel && dangerText.includes(failLabel)))) {
    return { type: "failure", successes: 0 };
  }

  // WoD20 roll cards display the computed success total in this area.
  // Prefer a labelled count, then fall back to the final integer.
  const labelled = text.match(/(-?\d+)\s*(?:success(?:es)?)/i);
  const trailing = text.match(/(-?\d+)\s*$/);
  const match = labelled || trailing;
  if (!match) return null;

  const successes = Number.parseInt(match[1], 10);
  if (!Number.isFinite(successes)) return null;
  if (successes < 0) return { type: "botch", successes };
  if (successes === 0) return { type: "failure", successes: 0 };
  return { type: "success", successes };
}

function findWoD20ResultAreas(message) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(message.content || "", "text/html");

  // Scope to the WoD20 card to avoid reacting to unrelated systems.
  const card = doc.querySelector(".wod20-roll");
  if (!card) return [];

  return [...card.querySelectorAll(".tray-roll-area .tray-success-area")];
}

function soundKeyForOutcome(outcome, config) {
  if (outcome.type === "botch") return "botch";
  if (outcome.type === "failure") return "failure";

  if (
    config.exceptionalEnabled &&
    outcome.successes >= Math.max(1, Number(config.exceptionalThreshold) || 5)
  ) return "exceptional";

  const names = {
    1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
    6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten"
  };
  return names[outcome.successes] || "many";
}

function handleDiceSoNiceComplete(messageId) {
  const config = getConfig();
  if (!config.enabled) return;

  const id = typeof messageId === "string" ? messageId : messageId?.id;
  if (!id || seenMessageIds.has(id)) return;

  const message = game.messages.get(id);
  if (!message) return;

  if (config.ownOnly && message.user?.id !== game.user.id) return;

  const areas = findWoD20ResultAreas(message);
  if (!areas.length) return;

  seenMessageIds.add(id);
  if (seenMessageIds.size > 500) {
    seenMessageIds.delete(seenMessageIds.values().next().value);
  }

  const outcomes = areas
    .map(parseWoD20Outcome)
    .filter(Boolean);

  outcomes.forEach((outcome, index) => {
    const key = soundKeyForOutcome(outcome, config);
    const selected = config.sounds?.[key];
    const path = resolveSoundPath(config, selected);
    if (!path) return;

    // Multiple result groups in one message play in sequence.
    window.setTimeout(
      () => playSound(path, config.volume),
      index * 300
    );
  });
}

function activateListener() {
  Hooks.off("diceSoNiceRollComplete", handleDiceSoNiceComplete);
  Hooks.on("diceSoNiceRollComplete", handleDiceSoNiceComplete);
  console.info(`${MODULE_ID} | Dice So Nice completion listener registered.`);
}

/**
 * Settings window (ApplicationV2).
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function getFilePickerClass() {
  // CONFIG.ux.FilePicker is the supported entry point in v12 and v13+.
  return CONFIG.ux?.FilePicker
    ?? foundry.applications?.apps?.FilePicker?.implementation
    ?? foundry.applications?.apps?.FilePicker
    ?? globalThis.FilePicker;
}

async function openFilePicker({ type, current, callback }) {
  try {
    const FP = getFilePickerClass();
    if (!FP) throw new Error("FilePicker class not found");
    const picker = new FP({ type, current, callback });
    const isV2 = picker instanceof foundry.applications.api.ApplicationV2;
    await (isV2 ? picker.render({ force: true }) : picker.render(true));
    picker.bringToFront?.();
  } catch (err) {
    console.error(`${MODULE_ID} | Could not open the file browser`, err);
    ui.notifications.error(`D10 Success Sound Player: could not open the file browser. ${err.message || err}`);
  }
}

class D10SuccessSoundPlayerConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-configuration`,
    tag: "form",
    classes: ["d10-success-sound-player", "standard-form"],
    window: {
      title: "D10 Success Sound Player",
      icon: "fas fa-volume-up",
      resizable: true
    },
    position: { width: 680 },
    form: {
      handler: D10SuccessSoundPlayerConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/settings.html` }
  };

  constructor(options = {}) {
    // Fixed height (not "auto") so content taller than the screen can scroll.
    const height = Math.max(400, Math.min(780, Math.round(window.innerHeight * 0.85)));
    super(foundry.utils.mergeObject({ position: { height } }, options));
  }

  async _prepareContext(_options) {
    const config = getConfig();
    return {
      ...config,
      volumePercent: Math.round(config.volume * 100),
      soundFields: SOUND_FIELDS.map(([key, label]) => ({
        key,
        label,
        path: config.sounds?.[key] || ""
      }))
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    // Make the window body scrollable.
    const content = root.querySelector(".window-content");
    if (content) {
      content.style.overflowY = "auto";
      content.style.overflowX = "hidden";
    }

    // Volume label
    const volume = root.querySelector('input[name="volume"]');
    const label = root.querySelector("[data-volume-label]");
    if (volume && label) {
      volume.addEventListener("input", () => { label.textContent = `${volume.value}%`; });
    }

    // Buttons: direct listeners (no dependency on ApplicationV2 action dispatch)
    root.querySelectorAll("[data-wod-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#handleAction(button.dataset.wodAction, button.dataset.key);
      });
    });
  }

  #field(name) {
    return this.element.querySelector(`[name="${name}"]`);
  }

  #currentVolume() {
    return Number(this.#field("volume")?.value ?? 80) / 100;
  }

  #handleAction(action, key) {
    const folderValue = this.#field("folder")?.value;

    switch (action) {
      case "browseFolder": {
        const input = this.#field("folder");
        openFilePicker({
          type: "folder",
          current: normalizeFoundryPath(input?.value || "sounds"),
          callback: (path) => { if (input) input.value = path; }
        });
        break;
      }
      case "browseSound": {
        const input = this.#field(`sound-${key}`);
        openFilePicker({
          type: "audio",
          current: normalizeFoundryPath(folderValue || "sounds"),
          callback: (path) => {
            if (input) input.value = path;
            console.info(`${MODULE_ID} | FilePicker selected audio path:`, path);
          }
        });
        break;
      }
      case "testSound": {
        const path = this.#field(`sound-${key}`)?.value;
        playSound(resolveSoundPath({ folder: folderValue }, path), this.#currentVolume());
        break;
      }
      case "testAll": {
        const first = this.#field("sound-one")?.value;
        playSound(resolveSoundPath({ folder: folderValue }, first), this.#currentVolume());
        break;
      }
    }
  }

  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;
    const truthy = (v) => v === true || v === "on" || v === "true";

    const sounds = {};
    for (const [key] of SOUND_FIELDS) {
      sounds[key] = String(data[`sound-${key}`] || "").trim();
    }

    const config = {
      enabled: truthy(data.enabled),
      folder: String(data.folder || "sounds/wod20").trim(),
      volume: Math.max(0, Math.min(1, Number(data.volume) / 100)),
      ownOnly: truthy(data.ownOnly),
      exceptionalEnabled: truthy(data.exceptionalEnabled),
      exceptionalThreshold: Math.max(1, Number(data.exceptionalThreshold) || 5),
      sounds
    };

    await game.settings.set(MODULE_ID, SETTING_KEY, config);
    ui.notifications.info("D10 Success Sound Player settings saved.");
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: "D10 Success Sound Player World Configuration",
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(DEFAULT_CONFIG)
  });

  game.settings.registerMenu(MODULE_ID, "configuration", {
    name: "D10 Success Sound Player",
    label: "Configure sounds",
    hint: "GM: choose the shared sound folder and configure sounds for all players.",
    icon: "fas fa-volume-up",
    type: D10SuccessSoundPlayerConfig,
    restricted: true
  });
});

Hooks.once("ready", () => {
  if (game.system.id !== "worldofdarkness") {
    console.warn(`${MODULE_ID} | This module is intended for the World of Darkness 20th system.`);
    return;
  }

  if (!game.modules.get("dice-so-nice")?.active) {
    ui.notifications.warn("D10 Success Sound Player requires Dice So Nice! to be enabled.");
    return;
  }

  activateListener();
  console.info(`${MODULE_ID} | Ready.`);
});

import { BOT_CONFIG, RUNTIME_CONFIG } from "./config.js";

const SAFE_COMMANDS = [
  "protect on",
  "protect off",
  "protect photo on",
  "protect photo off",
  "protect name on",
  "protect name off",
  "protect nickname on",
  "protect nickname off",
  "zll on",
  "zll off",
  "developer",
  "help",
];

const HELP_MESSAGE = [
  "الأوامر المتاحة:",
  "protect on - تفعيل حماية صورة المجموعة والاسم واللقب",
  "protect off - إيقاف الحماية",
  "protect photo on/off - حماية صورة المجموعة",
  "protect name on/off - حماية اسم المجموعة",
  "protect nickname on/off - حماية لقب المجموعة",
  "zll on/off - غير متاح لأنه يسبب السبام",
  "developer - معلومات المطوّر",
].join("\n");

const WELCOME_MESSAGE = [
  `السلام عليكم ورحمة الله - ${BOT_CONFIG.name}`,
  "",
  "مرحبا بكم. أنا بوت بسيط لحماية المجموعة ومكافحة السبام.",
  "كتب help باش تشوف الأوامر المتاحة.",
].join("\n");

const DEVELOPER_CARD = {
  name: "issmail",
  nickname: "meddah",
  city: "es-smara",
  age: "15y",
  profileUrl: "https://www.facebook.com/profile.php?id=61594329770983",
  imagePath: "/assets/developer-profile.jpg",
};

const PROTECTED_FIELDS = new Set(["photo", "name", "nickname"]);

function normalizeCommand(text) {
  const raw = String(text ?? "").trim();
  if (raw === "." || raw.toLowerCase() === "point") return "help";
  return raw.replace(/^[/!]+/, "").replace(/\s+/g, " ").toLowerCase();
}

function parseCommand(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const normalized = normalizeCommand(raw);
  if (
    raw.startsWith("/") ||
    raw.startsWith("!") ||
    raw === "." ||
    /^(help|commands|developer|dev|protect(?: (?:photo|name|nickname))? (?:on|off)|zll (?:on|off)|nik |insult )/i.test(
      normalized,
    )
  ) {
    return normalized;
  }
  return null;
}

function groupState() {
  return {
    protections: {
      photo: false,
      name: false,
      nickname: false,
    },
    welcomeEnabled: true,
    spam: new Map(),
    strikes: new Map(),
  };
}

export class ModerationBot {
  constructor(adapter, options = {}) {
    this.adapter = adapter;
    this.groups = new Map();
    this.windowMs = Number(options.windowMs ?? RUNTIME_CONFIG.windowMs);
    this.maxMessages = Number(options.maxMessages ?? RUNTIME_CONFIG.maxMessages);
    this.strikeLimit = Number(options.strikeLimit ?? RUNTIME_CONFIG.strikeLimit);
    this.now = options.now ?? (() => Date.now());
  }

  getGroup(groupId) {
    if (!this.groups.has(groupId)) {
      this.groups.set(groupId, groupState());
    }
    return this.groups.get(groupId);
  }

  async handle(event) {
    if (!event || !event.groupId) {
      throw new Error("event.groupId is required");
    }

    const group = this.getGroup(event.groupId);

    if (event.type === "member_added") {
      return this.respond(event, group.welcomeEnabled ? WELCOME_MESSAGE : null);
    }

    if (event.type === "group_profile_changed") {
      return this.handleProfileChange(event, group);
    }

    if (event.type !== "message") {
      return { actions: [], ignored: true, reason: "unsupported_event_type" };
    }

    const command = parseCommand(event.text);
    if (command !== null) {
      return this.handleCommand(event, group, command);
    }

    return this.handleSpam(event, group);
  }

  async handleCommand(event, group, command) {
    if (command === "help" || command === "commands") {
      return this.respond(event, HELP_MESSAGE);
    }

    if (command === "developer" || command === "dev") {
      return this.respond(event, null, {
        type: "developer_card",
        card: DEVELOPER_CARD,
      });
    }

    if (command === "zll on" || command === "zll off") {
      return this.respond(
        event,
        "هذا الأمر غير متاح لأنه كيرسل رسائل متكررة وكيقدر يزعج أعضاء المجموعة. استعمل protect أو help.",
      );
    }

    const protectionMatch = command.match(/^protect(?: (photo|name|nickname))? (on|off)$/);
    if (protectionMatch) {
      if (!event.isAdmin && !event.isModerator) {
        return this.respond(event, "خاصك تكون Admin أو Moderator باش تبدل إعدادات الحماية.");
      }
      const [, target, value] = protectionMatch;
      const enabled = value === "on";
      const targets = target ? [target] : ["photo", "name", "nickname"];

      for (const key of targets) {
        group.protections[key] = enabled;
      }

      return this.respond(
        event,
        `${targets.map((key) => `${key}: ${enabled ? "on" : "off"}`).join(" | ")}\nحالة الحماية تبدلات بنجاح.`,
      );
    }

    if (command.startsWith("nik ") || command.startsWith("insult ")) {
      return this.respond(
        event,
        "أوامر الإهانة أو إغراق المجموعة بالرسائل غير متاحة. البوت مخصص للحماية ومكافحة السبام.",
      );
    }

    if (command === "." || command === "point") {
      return this.respond(event, HELP_MESSAGE);
    }

    return { actions: [], ignored: true, reason: "unknown_command", command };
  }

  async handleSpam(event, group) {
    if (event.isAdmin || event.isModerator || event.userId === event.botId) {
      return { actions: [], ignored: false, spam: false };
    }

    if (!event.userId) {
      return { actions: [], ignored: true, reason: "event.userId is required" };
    }

    const now = this.now();
    const timestamps = (group.spam.get(event.userId) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );
    timestamps.push(now);
    group.spam.set(event.userId, timestamps);

    if (timestamps.length <= this.maxMessages) {
      return { actions: [], ignored: false, spam: false };
    }

    const strikes = (group.strikes.get(event.userId) ?? 0) + 1;
    group.strikes.set(event.userId, strikes);
    const actions = [
      {
        type: "warn",
        groupId: event.groupId,
        userId: event.userId,
        reason: "rapid_messages",
      },
    ];

    if (strikes >= this.strikeLimit) {
      actions.push({
        type: "remove",
        groupId: event.groupId,
        userId: event.userId,
        reason: "repeated_spam",
      });
      group.strikes.set(event.userId, 0);
    } else {
      actions.push({
        type: "mute",
        groupId: event.groupId,
        userId: event.userId,
        durationSeconds: 60,
        reason: "rapid_messages",
      });
    }

    await this.dispatch(actions);
    return {
      actions,
      spam: true,
      strikes,
      reply: "تم رصد رسائل متسارعة. نقص من الإرسال باش ما يتعاقبش الحساب.",
    };
  }

  async handleProfileChange(event, group) {
    const field = event.field;
    if (!PROTECTED_FIELDS.has(field) || !group.protections[field] || event.isAdmin || event.isModerator) {
      return { actions: [], ignored: false, protected: false };
    }

    const action = {
      type: "restore_group_profile",
      groupId: event.groupId,
      field,
      previousValue: event.previousValue,
      attemptedValue: event.value,
    };
    await this.dispatch([action]);
    return { actions: [action], protected: true };
  }

  async respond(event, text, extra = null) {
    const actions = [];
    if (text) {
      actions.push({
        type: "send_message",
        groupId: event.groupId,
        replyTo: event.messageId ?? null,
        text,
      });
    }
    if (extra) {
      actions.push({ groupId: event.groupId, replyTo: event.messageId ?? null, ...extra });
    }
    await this.dispatch(actions);
    return { actions, reply: text, ...(extra ?? {}) };
  }

  async dispatch(actions) {
    for (const action of actions) {
      if (typeof this.adapter?.execute === "function") {
        await this.adapter.execute(action);
      }
    }
  }

  snapshot(groupId) {
    const group = this.getGroup(groupId);
    return {
      protections: { ...group.protections },
      welcomeEnabled: group.welcomeEnabled,
      activeSpamUsers: group.spam.size,
      strikes: Object.fromEntries(group.strikes),
      safeCommands: SAFE_COMMANDS,
    };
  }
}

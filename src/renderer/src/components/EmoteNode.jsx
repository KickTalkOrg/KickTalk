import { DecoratorNode } from "lexical";

const CustomEmoteComponent = ({ emoteId, emoteName, platform }) => {
  console.log(emoteId, emoteName, platform);
  if (platform === "kick") {
    return (
      <img src={`https://files.kick.com/emotes/${emoteId}/fullsize`} alt={emoteName} emote-id={emoteId} emote-name={emoteName} />
    );
  } else if (platform === "7tv") {
    return <img src={`https://cdn.7tv.app/emote/${emoteId}/1x.webp`} alt={emoteName} emote-id={emoteId} emote-name={emoteName} />;
  } else {
    return emoteName;
  }
};

export class EmoteNode extends DecoratorNode {
  __emoteId;
  __emoteName;
  __platform;

  static getType() {
    return "emote";
  }

  static clone(node) {
    return new EmoteNode(node.__emoteId, node.__emoteName, node.__platform, node.__key);
  }

  constructor(emoteId, emoteName, platform, key) {
    super(key);
    this.__emoteId = emoteId;
    this.__emoteName = emoteName;
    this.__platform = platform;
  }

  createDOM() {
    const div = document.createElement("div");
    div.className = "emoteContainer";
    return div;
  }

  updateDOM() {
    return false;
  }

  static importDOM() {
    return {
      img: (node) => {
        const emoteId = node.getAttribute("emote-id");
        const emoteName = node.getAttribute("emote-name");
        const platform = node.getAttribute("platform");
        if (emoteId && emoteName && platform) {
          return new EmoteNode(emoteId, emoteName, platform);
        }
      },
    };
  }

  exportDOM() {
    const img = document.createElement("img");
    img.setAttribute("data-emote-id", this.__emoteId);
    img.setAttribute("data-emote-name", this.__emoteName);
    img.setAttribute("data-platform", this.__platform);
    return { element: img };
  }

  static importJSON(serializedNode) {
    const { emoteId, emoteName, platform } = serializedNode;
    return new EmoteNode(emoteId, emoteName, platform);
  }

  exportJSON() {
    return {
      type: this.getType(),
      emoteId: this.__emoteId,
      emoteName: this.__emoteName,
      platform: this.__platform,
    };
  }

  isIsolated() {
    return true;
  }

  getTextContent() {
    if (this.__platform === "kick") {
      console.log("kick", this.__emoteId, this.__emoteName);
      return `[emote:${this.__emoteId}:${this.__emoteName}]`;
    } else if (this.__platform === "7tv") {
      return ` ${this.__emoteName} `;
    } else {
      return " ";
    }
  }

  decorate() {
    return <CustomEmoteComponent emoteId={this.__emoteId} emoteName={this.__emoteName} platform={this.__platform} />;
  }
}

export function $createEmoteNode(id) {
  return new EmoteNode(id);
}

export function $isEmoteNode(node) {
  return node instanceof EmoteNode;
}

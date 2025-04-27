import { DecoratorNode } from "lexical";

const CustomEmoteComponent = ({ emoteId, emoteName }) => {
  return (
    <img src={`https://files.kick.com/emotes/${emoteId}/fullsize`} alt={emoteName} emote-id={emoteId} emote-name={emoteName} />
  );
};

export class EmoteNode extends DecoratorNode {
  __emoteId;
  __emoteName;

  static getType() {
    return "emote";
  }

  static clone(node) {
    return new EmoteNode(node.__emoteId, node.__emoteName, node.__key);
  }

  constructor(emoteId, emoteName, key) {
    super(key);
    this.__emoteId = emoteId;
    this.__emoteName = emoteName;
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
        if (emoteId && emoteName) {
          return new EmoteNode(emoteId, emoteName);
        }
      },
    };
  }

  exportDOM() {
    const img = document.createElement("img");
    img.setAttribute("data-emote-id", this.__emoteId);
    img.setAttribute("data-emote-name", this.__emoteName);
    return { element: img };
  }

  static importJSON(serializedNode) {
    const { emoteId, emoteName } = serializedNode;
    return new EmoteNode(emoteId, emoteName);
  }

  exportJSON() {
    return {
      type: this.getType(),
      emoteId: this.__emoteId,
      emoteName: this.__emoteName,
    };
  }

  isIsolated() {
    return true;
  }

  getTextContent() {
    return `[emote:${this.__emoteId}:${this.__emoteName}]`;
  }

  decorate() {
    return <CustomEmoteComponent emoteId={this.__emoteId} emoteName={this.__emoteName} />;
  }
}

export function $createEmoteNode(id) {
  return new EmoteNode(id);
}

export function $isEmoteNode(node) {
  return node instanceof EmoteNode;
}

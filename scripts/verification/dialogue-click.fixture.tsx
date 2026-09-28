import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PlayerDialogueBox, resolvePlayerSystemCopy } from "@mage2/player-ui";

const tree = { id: "intro", name: "Intro", startNodeId: "first", nodes: [
  { id: "first", speaker: "Narrator", textId: "first", narration: true, effects: [], choices: [] },
  { id: "second", speaker: "Narrator", textId: "second", narration: true, effects: [], choices: [] },
  { id: "topics", speaker: "Guide", textId: "topics", effects: [], choices: [
    { id: "replay", textId: "replay", conditions: [], effects: [] }
  ] }
] };
function Fixture() {
  const [index, setIndex] = useState(0);
  const node = tree.nodes[index]!;
  return <div className="mage2-experience__game-canvas" style={{ height: 400 }} data-passage={node.id}>
    <PlayerDialogueBox activeDialogue={{ tree, node, choices: node.choices, entrySequence: index }}
      strings={{ first: "A moment.", second: "Another moment.", topics: "Choose a topic.", replay: "Replay" }}
      copy={resolvePlayerSystemCopy("en")} onContinue={() => setIndex(value => value + 1)} onChoice={() => setIndex(0)} />
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

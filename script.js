const CHORD_PATTERN = /^[A-H][#b]?(?:maj|min|m|dim|aug|sus[24]?|add\d+)?\d*(?:sus[24]|add\d+)?(?:b5|#5)?(?:\/[A-H][#b]?)?$/i;
const CHORD_TOKEN_PATTERN = /[A-H][#b]?(?:maj|min|m|dim|aug|sus[24]?|add\d+)?\d*(?:sus[24]|add\d+)?(?:b5|#5)?(?:\/[A-H][#b]?)?/gi;

function isChordsLine(value) {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.split(/\s+/).every((part) => part === "|" || CHORD_PATTERN.test(part));
}

function parseChords(source) {
  const lines = [];

  source.split(/\r?\n/).forEach((rawLine) => {
    if (!rawLine.trim()) return;
    const content = rawLine.trim();

    if (content.startsWith("!")) {
      lines.push({ type: "title", content: content.slice(1).trim() });
    } else if (content.startsWith("//")) {
      lines.push({ type: "chorus" });
    } else if (isChordsLine(content)) {
      lines.push({ type: "chords", content: content.split(/\s+/).filter((part) => part !== "|"), raw: rawLine });
    } else {
      lines.push({ type: "text", content: rawLine });
    }
  });

  const merged = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.type === "chords" && !line.raw.includes("|") && lines[index + 1]?.type === "text") {
      merged.push({ type: "chord-text", content: attachChords(line, lines[index + 1]) });
      index += 1;
    } else {
      if (line.type === "chords") {
        const { raw, ...parsedLine } = line;
        merged.push(parsedLine);
      } else {
        merged.push(line);
      }
    }
  }
  return merged;
}

function attachChords(chordLine, textLine) {
  const text = textLine.content;
  const chordPositions = [];
  const matcher = new RegExp(CHORD_TOKEN_PATTERN.source, CHORD_TOKEN_PATTERN.flags);
  let match;
  while ((match = matcher.exec(chordLine.raw))) {
    if (match[0] === "|") continue;
    chordPositions.push({ position: match.index, chord: match[0] });
  }
  const lyricWords = [];
  const wordMatcher = /\S+|\s+/g;
  while ((match = wordMatcher.exec(text))) {
    lyricWords.push({
      start: match.index,
      end: match.index + match[0].length,
      word: match[0],
      chords: [],
    });
  }

  chordPositions.forEach(({ position, chord }) => {
    let word = lyricWords.find((item) => position >= item.start && position < item.end);
    if (!word) word = lyricWords.find((item) => item.start >= position);
    if (!word && lyricWords.length) word = lyricWords[lyricWords.length - 1];
    if (word) {
      const targetOffset = Math.max(0, Math.min(position - word.start, word.word.length - 1));
      word.chords.push({
        type: "chord",
        word: word.word[targetOffset],
        offset: /^\s+$/.test(word.word) ? 0 : targetOffset,
        chord,
      });
    }
  });

  return lyricWords
    .filter((item, index) => item.chords.length || !/^\s+$/.test(item.word)
      || (index > 0 && index < lyricWords.length - 1))
    .map((item) => {
      const normalizedWord = /^\s+$/.test(item.word) ? " " : item.word;
      const wordParts = [{ type: "word", word: normalizedWord }];
      wordParts.push(...item.chords);
      return wordParts;
    });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatChords(lines, container) {
  let output = "";
  let inChorus = false;

  lines.forEach((line) => {
    if (line.type === "chorus") {
      output += inChorus ? "</div>" : '<div class="song__chorus" aria-label="Припев">';
      inChorus = !inChorus;
      return;
    }
    if (line.type === "title") {
      output += `<h1 class="song__title">${escapeHtml(line.content)}</h1>`;
      return;
    }
    if (line.type === "chords") {
      output += `<div class="song__line song__line--chords">${line.content.map((chord) => `<span class="song__chord" data-chord="${escapeHtml(chord)}"></span>`).join(" ")}</div>`;
      return;
    }
    if (line.type === "text") {
      output += `<div class="song__line">${escapeHtml(line.content)}</div>`;
      return;
    }

    const content = line.content.map((wordParts) => {
      const wordPart = wordParts.find((part) => part.type === "word");
      const chordParts = wordParts.filter((part) => part.type === "chord");
      const chordsByOffset = new Map();
      chordParts.forEach((chord) => {
        if (!chordsByOffset.has(chord.offset)) chordsByOffset.set(chord.offset, []);
        chordsByOffset.get(chord.offset).push(chord.chord);
      });

      const word = Array.from(wordPart.word).map((character, charIndex) => {
        const chords = chordsByOffset.get(charIndex);
        return chords
          ? `<span class="song__chord-point" data-chord="${escapeHtml(chords.join(" "))}">${escapeHtml(character)}</span>`
          : escapeHtml(character);
      }).join("");
      const wordClass = chordParts.length ? "song__word song__word--chorded" : "song__word";
      return `<span class="${wordClass}">${word}</span>`;
    }).join("");
    output += `<div class="song__line song__line--chord-text">${content}</div>`;
  });

  if (inChorus) output += "</div>";
  container.innerHTML = output;
}

function init() {
  const song = document.querySelector("#song");
  const lyrics = document.querySelector("#lyrics");
  const layer = document.querySelector("#chord-layer");
  const labels = new Map();
  const gap = 8;
  const verticalGap = 4;
  let frame = 0;

  formatChords(parseChords(source), lyrics);

  function syncLabels(points) {
    const live = new Set(points);
    for (const [point, label] of labels) {
      if (!live.has(point)) {
        label.remove();
        labels.delete(point);
      }
    }
    for (const point of points) {
      let label = labels.get(point);
      const chord = point.dataset.chord || "";
      if (!label) {
        label = document.createElement("span");
        label.className = "song__chord-label";
        layer.append(label);
        labels.set(point, label);
      }
      if (label.textContent !== chord) label.textContent = chord;
    }
  }

  function layout() {
    frame = 0;
    const points = [...lyrics.querySelectorAll(".song__chord-point[data-chord]")];
    syncLabels(points);

    // Read all geometry before writing label positions.
    const layerRect = layer.getBoundingClientRect();
    const items = points.map((point) => {
      const markerRect = point.getBoundingClientRect();
      const label = labels.get(point);
      const labelRect = label.getBoundingClientRect();
      return {
        label,
        x: markerRect.left - layerRect.left + markerRect.width / 2,
        lineTop: markerRect.top - layerRect.top,
        markerTop: markerRect.top,
        width: labelRect.width,
        height: labelRect.height,
      };
    }).filter((item) => item.width > 0 && item.height > 0);

    // Group markers by their rendered line after browser wrapping.
    const lines = [];
    for (const item of items) {
      let line = lines[lines.length - 1];
      if (!line || Math.abs(line.top - item.markerTop) > 2) {
        line = { top: item.markerTop, items: [] };
        lines.push(line);
      }
      line.items.push(item);
    }

    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      let previousRight = -Infinity;
      for (const item of line.items) {
        const centeredLeft = item.x - item.width / 2;
        const left = Math.max(centeredLeft, previousRight + gap);
        const top = item.lineTop - item.height - verticalGap;
        item.label.style.left = `${left}px`;
        item.label.style.top = `${top}px`;
        item.label.style.visibility = "visible";
        previousRight = left + item.width;
      }
    }
  }

  function scheduleLayout() {
    if (frame) return;
    frame = requestAnimationFrame(layout);
  }

  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(song);
  resizeObserver.observe(lyrics);

  const mutationObserver = new MutationObserver(scheduleLayout);
  mutationObserver.observe(lyrics, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-chord", "class", "style"],
  });

  window.addEventListener("resize", scheduleLayout, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleLayout, { passive: true });
  if (document.fonts) {
    document.fonts.ready.then(scheduleLayout);
    document.fonts.addEventListener?.("loadingdone", scheduleLayout);
  }
  scheduleLayout();
}

document.addEventListener("DOMContentLoaded", init);

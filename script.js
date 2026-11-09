const CHORD_PATTERN = /^[A-H][#b]?(?:maj|min|m|dim|aug|sus[24]?|add\d+)?\d*(?:sus[24]|add\d+)?(?:b5|#5)?(?:\/[A-H][#b]?)?$/i;
const CHORD_TOKEN_PATTERN = /[A-H][#b]?(?:maj|min|m|dim|aug|sus[24]?|add\d+)?\d*(?:sus[24]|add\d+)?(?:b5|#5)?(?:\/[A-H][#b]?)?/gi;

function isChordsLine(value) {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.split(/\s+/).every((part) => part === "|" || CHORD_PATTERN.test(part));
}

function parseLines(source) {
  const lines = [];

  source.split(/\r?\n/).forEach((rawLine) => {
    if (!rawLine.trim()) return;
    const content = rawLine.trim();

    if (content.startsWith("#")) {
      lines.push({ type: "title", content: content.slice(1).trim() });
    } else if (content === ">>") {
      lines.push({ type: "chorus" });
    } else if (content.startsWith("//")) {
      lines.push({ type: "comment", content: content.slice(2).trim() });
    } else if (content.includes("//")) {
      const [chords, ...commentParts] = content.split("//");
      const comment = commentParts.join("//").trim();
      if (comment && isChordsLine(chords)) {
        lines.push({ type: "chords-comment", chords: chords.trim().split(/\s+/), comment });
      } else {
        lines.push({ type: "text", content: rawLine });
      }
    } else if (isChordsLine(content)) {
      lines.push({ type: "chords", content: content.split(/\s+/), raw: rawLine });
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

function parseSongs(lines) {
  const songs = [];
  let currentSong = null;

  lines.forEach((line) => {
    if (line.type === "title") {
      currentSong = { title: line.content, content: [] };
      songs.push(currentSong);
      return;
    }

    currentSong.content.push(line);
  });

  return songs;
}

function attachChords(chordLine, textLine) {
  let text = textLine.content;
  const chordPositions = [];
  const matcher = new RegExp(CHORD_TOKEN_PATTERN.source, CHORD_TOKEN_PATTERN.flags);
  let match;
  while ((match = matcher.exec(chordLine.raw))) {
    if (match[0] === "|") continue;
    chordPositions.push({ position: match.index, chord: match[0] });
  }
  const lastChordPosition = Math.max(-1, ...chordPositions.map(({ position }) => position));
  if (lastChordPosition >= text.length) {
    text += " ".repeat(lastChordPosition - text.length + 1);
  }

  const lyricWords = [];
  const wordMatcher = /\S+|\s/g;
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

  return lyricWords.map((item) => {
    const wordParts = [{ type: "word", word: item.word }];
    wordParts.push(...item.chords);
    return wordParts;
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatSong(song, index) {
  let output = "";
  let inChorus = false;

  const hidden = index === 0 ? "" : " hidden";
  output += `<section class="song__section" data-song-index="${index}"${hidden}><h1 id="song-title-${index + 1}" class="song__title">${escapeHtml(song.title)}</h1>`;

  song.content.forEach((line) => {
    if (line.type === "chorus") {
      output += inChorus ? "</div>" : '<div class="song__chorus" aria-label="Припев">';
      inChorus = !inChorus;
      return;
    }
    if (line.type === "chords") {
      output += `<div class="song__line song__line--chords">${line.content.map((chord) => `<span class="song__chord" data-chord="${escapeHtml(chord)}"></span>`).join(" ")}</div>`;
      return;
    }
    if (line.type === "chords-comment") {
      const chords = line.chords.map((chord) => `<span class="song__chord" data-chord="${escapeHtml(chord)}"></span>`).join(" ");
      output += `<div class="song__line song__line--chords">${chords}<span class="song__comment song__comment--inline">${escapeHtml(line.comment)}</span></div>`;
      return;
    }
    if (line.type === "text") {
      output += `<div class="song__line">${escapeHtml(line.content)}</div>`;
      return;
    }
    if (line.type === "comment") {
      output += `<aside class="song__comment">${escapeHtml(line.content)}</aside>`;
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
        const renderedCharacter = character === " " ? "&nbsp;" : escapeHtml(character);
        return chords
          ? `<span class="song__chord-point" data-chord="${escapeHtml(chords.join(" "))}">${renderedCharacter}</span>`
          : renderedCharacter;
      }).join("");
      const wordClass = chordParts.length ? "song__word song__word--chorded" : "song__word";
      const spaceClass = /^\s$/.test(wordPart.word) ? " song__word--space" : "";
      return `<span class="${wordClass}${spaceClass}">${word}</span>`;
    }).join("");
    output += `<div class="song__line song__line--chord-text">${content}</div>`;
  });

  if (inChorus) output += "</div>";
  return `${output}</section>`;
}

function normalizeTitle(value) {
  return String(value ?? "").toLocaleLowerCase("ru").trim();
}

function getTocSections(sourceToc) {
  const sections = [];
  let currentSection = null;

  sourceToc.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const songEntry = line.match(/^\d+[.)]\s*(.+)$/);
    if (!songEntry) {
      currentSection = { section: line.replace(/[.:]+$/, ""), entries: [] };
      sections.push(currentSection);
      return;
    }
    if (!currentSection) {
      currentSection = { section: "", entries: [] };
      sections.push(currentSection);
    }
    currentSection.entries.push(songEntry[1].trim());
  });

  return sections;
}

function matchTocSongs(songs, sourceToc) {
  const orderedSongs = songs.map((song) => ({ origTitle: song.title, title: normalizeTitle(song.title), matched: false }))
    .sort((a, b) => b.title.length - a.title.length);
  const sections = getTocSections(sourceToc);
  const pendingEntries = sections.flatMap((section, sectionIndex) => section.entries.map((entry) => ({
    sectionIndex,
    title: normalizeTitle(entry),
  })));

  function assign(entry, candidate) {
    entry.match = candidate;
    candidate.matched = true;
  }

  pendingEntries.forEach((entry) => {
    const parts = entry.title.split("-");
    if (parts.length !== 2) return;
    const candidate = orderedSongs
        .filter((item) => !item.matched)
        .find((item) => item.title === parts[1]);
    if (candidate) assign(entry, candidate);
  });

  pendingEntries.filter((entry) => !entry.match).forEach((entry) => {
    const candidate = orderedSongs
        .filter((item) => !item.matched)
        .find((item) => entry.title.endsWith(item.title));
    if (candidate) assign(entry, candidate);
  });

  pendingEntries.filter((entry) => !entry.match).forEach((entry) => {
    const referenceWords = entry.title.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    let bestCandidate = null;
    let bestCount = 0;
    orderedSongs.filter((item) => !item.matched).forEach((candidate) => {
      const count = candidate.title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
        .filter((word) => referenceWords.includes(word)).length;
      if (count > bestCount) {
        bestCandidate = candidate;
        bestCount = count;
      }
    });
    if (bestCandidate) assign(entry, bestCandidate);
  });

  const output = sections.map(({ section }) => ({ section, songs: [] }));
  pendingEntries.forEach(({ sectionIndex, match }) => {
    if (match) output[sectionIndex].songs.push(match.origTitle);
  });
  const unmatchedSongs = orderedSongs.filter((song) => !song.matched).map((song) => song.origTitle);
  if (unmatchedSongs.length) output.push({ section: "Другое", songs: unmatchedSongs });
  return output;
}

function formatSongs(songs, tocElement, lyricsElement, tocSections) {
  let tocMarkup = "";
  let firstLink = true;
  tocSections.forEach((section) => {
    if (!section.songs.length) return;
    tocMarkup += `<h3 class="song__toc-section-title">${escapeHtml(section.section)}</h3>`;
    if (section.songs.length) {
      tocMarkup += `<ol class="song__toc-list">${section.songs.map((title) => {
        const index = songs.findIndex((song) => song.title === title);
        if (index < 0) return "";
        const current = firstLink ? ' aria-current="location"' : "";
        firstLink = false;
        return `<li class="song__toc-item"><a class="song__toc-link" href="#song-title-${index + 1}" data-song-index="${index}"${current}>${escapeHtml(title)}</a></li>`;
      }).join("")}</ol>`;
    }
  });
  tocElement.innerHTML = tocMarkup;

  let output = "";
  songs.forEach((song, index) => {
    output += formatSong(song, index);
  });
  lyricsElement.innerHTML = output;
}

function init() {
  const song = document.querySelector("#song");
  const lyrics = document.querySelector("#lyrics");
  const tocElement = document.querySelector("#song-toc");
  const layer = document.querySelector("#chord-layer");
  const labels = new Map();
  const gap = 8;
  const verticalGap = 4;
  let frame = 0;

  const lines = parseLines(source);
  const songs = parseSongs(lines);
  const tocSections = matchTocSongs(songs, toc);
  formatSongs(songs, tocElement, lyrics, tocSections);

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
    const points = [...lyrics.querySelectorAll(".song__chord-point[data-chord]")]
      .filter((point) => point.getClientRects().length > 0);
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

  tocElement.addEventListener("click", (event) => {
    const link = event.target.closest(".song__toc-link[data-song-index]");
    if (!link) return;

    const selectedIndex = Number(link.dataset.songIndex);
    lyrics.querySelectorAll(".song__section").forEach((section, index) => {
      section.hidden = index !== selectedIndex;
    });
    tocElement.querySelectorAll(".song__toc-link").forEach((item) => {
      if (item === link) item.setAttribute("aria-current", "location");
      else item.removeAttribute("aria-current");
    });
    scheduleLayout();
  });

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

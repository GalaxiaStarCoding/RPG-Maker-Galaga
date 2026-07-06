// renderer.js
// Runs in the browser window. Handles all UI logic: accessible tabs,
// the list-based map editor, event editor, database editor, and the
// AI assistant panel. No canvas/drag-drop anywhere — every interactive
// element is a real, focusable, labeled DOM control so NVDA can read it.

let project = null;
let selectedMapIndex = 0;
let selectedTileX = null;
let selectedTileY = null;
let selectedEventId = null;

// ---------------------------------------------------------------------
// Utility: announce a message via the polite/assertive live regions.
// This is how blind users get feedback for actions that don't move focus.
// ---------------------------------------------------------------------
function announce(message, urgent = false) {
  const region = document.getElementById(urgent ? 'live-alert' : 'live-status');
  // Clear then set, so repeated identical messages still get announced
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

// ---------------------------------------------------------------------
// Tabs: standard ARIA tabs keyboard pattern (Left/Right arrows move
// selection, Home/End jump to first/last, panels toggle hidden attr)
// ---------------------------------------------------------------------
function initTabs() {
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));

  function selectTab(index) {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
    });
    tabs[index].focus();
    announce(`${tabs[index].textContent} tab selected`);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(i));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') selectTab((i + 1) % tabs.length);
      else if (e.key === 'ArrowLeft') selectTab((i - 1 + tabs.length) % tabs.length);
      else if (e.key === 'Home') selectTab(0);
      else if (e.key === 'End') selectTab(tabs.length - 1);
    });
  });
}

// ---------------------------------------------------------------------
// Map editor: rendered as a real grid of buttons, each labeled with
// its coordinates and tile type. Screen readers announce both the
// tile content and its row/column position as focus moves.
// ---------------------------------------------------------------------
function renderMap() {
  const map = project.maps[selectedMapIndex];
  document.getElementById('map-name').textContent = map.name;
  document.getElementById('map-size').textContent = `${map.width} x ${map.height}`;

  const grid = document.getElementById('map-grid');
  grid.innerHTML = '';
  grid.setAttribute('aria-rowcount', String(map.height));
  grid.setAttribute('aria-colcount', String(map.width));

  map.tiles.forEach((rowTiles, y) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.className = 'grid-row';

    rowTiles.forEach((tile, x) => {
      const cell = document.createElement('button');
      cell.setAttribute('role', 'gridcell');
      cell.className = 'map-tile';
      cell.setAttribute('aria-rowindex', String(y + 1));
      cell.setAttribute('aria-colindex', String(x + 1));

      const eventHere = map.events.find((ev) => ev.x === x && ev.y === y);
      const label = eventHere
        ? `Row ${y + 1}, Column ${x + 1}: ${tile}, event: ${eventHere.name}`
        : `Row ${y + 1}, Column ${x + 1}: ${tile}`;
      cell.setAttribute('aria-label', label);
      cell.textContent = eventHere ? '\u2605' : '';

      cell.addEventListener('click', () => {
        selectedTileX = x;
        selectedTileY = y;
        document.querySelectorAll('.map-tile[aria-selected="true"]').forEach((el) => el.removeAttribute('aria-selected'));
        cell.setAttribute('aria-selected', 'true');
        announce(label);
      });

      row.appendChild(cell);
    });

    grid.appendChild(row);
  });

  renderEventList();
}

function renderEventList() {
  const map = project.maps[selectedMapIndex];
  const list = document.getElementById('map-event-list');
  list.innerHTML = '';
  if (map.events.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No events on this map yet.';
    list.appendChild(li);
    return;
  }
  map.events.forEach((ev) => {
    const li = document.createElement('li');
    li.textContent = `${ev.name} — at row ${ev.y + 1}, column ${ev.x + 1}, trigger: ${ev.trigger}`;
    list.appendChild(li);
  });
}

function announceMapSummary() {
  const map = project.maps[selectedMapIndex];
  const summary = `Map "${map.name}" is ${map.width} tiles wide by ${map.height} tiles tall, ` +
    `and has ${map.events.length} event${map.events.length === 1 ? '' : 's'}: ` +
    map.events.map((e) => e.name).join(', ') + '.';
  announce(summary, true);
}

// ---------------------------------------------------------------------
// Event editor
// ---------------------------------------------------------------------
function populateEventSelect() {
  const map = project.maps[selectedMapIndex];
  const select = document.getElementById('event-select');
  select.innerHTML = '';
  map.events.forEach((ev) => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = ev.name;
    select.appendChild(opt);
  });
  if (map.events.length) loadEventIntoForm(map.events[0].id);
}

function loadEventIntoForm(eventId) {
  const map = project.maps[selectedMapIndex];
  const ev = map.events.find((e) => e.id === eventId);
  if (!ev) return;
  selectedEventId = eventId;
  document.getElementById('event-name').value = ev.name;
  document.getElementById('event-trigger').value = ev.trigger;
  document.getElementById('event-commands').value = ev.commands.join('\n');
}

function initEventEditor() {
  document.getElementById('event-select').addEventListener('change', (e) => {
    loadEventIntoForm(e.target.value);
  });

  document.getElementById('event-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const map = project.maps[selectedMapIndex];
    const ev = map.events.find((ev) => ev.id === selectedEventId);
    if (!ev) return;
    ev.name = document.getElementById('event-name').value;
    ev.trigger = document.getElementById('event-trigger').value;
    ev.commands = document.getElementById('event-commands').value.split('\n').filter(Boolean);
    populateEventSelect();
    renderMap();
    announce(`Event "${ev.name}" saved.`);
  });
}

// ---------------------------------------------------------------------
// Database editor: generic form builder driven by the shape of each
// entry object, so Actors/Classes/Items/Skills/Enemies all reuse the
// same accessible form logic rather than bespoke screens each.
// ---------------------------------------------------------------------
function currentCategoryKey() {
  return document.getElementById('database-category').value;
}

function renderDatabaseList() {
  const key = currentCategoryKey();
  const entries = project.database[key] || [];
  const list = document.getElementById('database-entry-list');
  list.innerHTML = '';
  entries.forEach((entry) => {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = entry.name;
    list.appendChild(opt);
  });
  if (entries.length) renderDatabaseDetail(entries[0].id);
  else document.getElementById('database-detail').innerHTML = '<p>No entries yet. Use "Add New Entry".</p>';
}

function renderDatabaseDetail(entryId) {
  const key = currentCategoryKey();
  const entries = project.database[key] || [];
  const entry = entries.find((e) => e.id === entryId);
  const container = document.getElementById('database-detail');
  container.innerHTML = '';
  if (!entry) return;

  const form = document.createElement('form');
  Object.keys(entry).forEach((field) => {
    if (field === 'id') return;
    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const label = document.createElement('label');
    label.setAttribute('for', `field-${field}`);
    label.textContent = field;
    wrapper.appendChild(label);

    const input = document.createElement('input');
    input.id = `field-${field}`;
    input.value = entry[field];
    input.addEventListener('change', () => {
      const raw = input.value;
      entry[field] = isNaN(raw) || raw === '' ? raw : Number(raw);
    });
    wrapper.appendChild(input);

    form.appendChild(wrapper);
  });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save Entry';
  form.appendChild(saveBtn);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    renderDatabaseList();
    announce(`${entry.name} saved.`);
  });

  container.appendChild(form);
}

function initDatabaseEditor() {
  document.getElementById('database-category').addEventListener('change', renderDatabaseList);
  document.getElementById('database-entry-list').addEventListener('change', (e) => {
    renderDatabaseDetail(e.target.value);
  });
  document.getElementById('btn-add-entry').addEventListener('click', () => {
    const key = currentCategoryKey();
    const entries = project.database[key];
    const newId = `${key}-${Date.now()}`;
    const template = entries.length ? { ...entries[0] } : { name: 'New Entry' };
    template.id = newId;
    template.name = 'New Entry';
    entries.push(template);
    renderDatabaseList();
    announce('New entry added. Edit its fields below.');
  });
}

// ---------------------------------------------------------------------
// AI Assistant
//
// This is a lightweight LOCAL command interpreter for the demo/scaffold.
// It recognizes a handful of natural-language patterns and turns them into
// structured actions against the SAME data model the rest of the app edits
// (see "applyAction" below) — this is the "function calling" approach:
// the AI never freely edits raw files, it only calls known, validated
// actions, which keeps behavior predictable and undoable.
//
// To connect this to a real AI (e.g. Claude), replace `interpretCommand`
// with a call to your API of choice, asking it to return JSON matching
// the same action shape, e.g.:
//
//   const response = await fetch('https://api.anthropic.com/v1/messages', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       model: 'claude-sonnet-4-6',
//       max_tokens: 1000,
//       system: 'You control an RPG Maker tool. Reply ONLY with JSON: ' +
//               '{ "action": "create_menu"|"add_event"|"add_item"|"describe", "params": {...} }',
//       messages: [{ role: 'user', content: userText }],
//     }),
//   });
//
// then JSON.parse the model's text and pass it into applyAction().
// ---------------------------------------------------------------------

function interpretCommand(text) {
  const lower = text.toLowerCase();

  // "create a menu with Items, Skills, Equip, and Status"
  const menuMatch = lower.match(/menu (?:with|containing) (.+)/);
  if (menuMatch) {
    const labels = menuMatch[1]
      .replace(/ and /g, ',')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\.$/, ''))
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    return {
      action: 'create_menu',
      params: { name: 'Custom Menu', labels },
      confirmation: `Create a menu with these commands: ${labels.join(', ')}?`,
    };
  }

  // "add an npc/event that gives the player a potion" (or any item)
  const eventMatch = lower.match(/add (?:an?|the)? ?(?:npc|event).*gives? (?:the player )?(?:a |an )?([a-z ]+)/);
  if (eventMatch) {
    const itemName = eventMatch[1].trim();
    return {
      action: 'add_event',
      params: {
        name: `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} NPC`,
        commands: [`Show Text: Here, take this.`, `Give Item: ${itemName}`],
      },
      confirmation: `Add a new event on the current map that gives the player "${itemName}"?`,
    };
  }

  // "describe the map" / "what's on this map" / "read the map"
  if (/describe|what.?s on|read the map|summarize/.test(lower)) {
    return { action: 'describe_map', params: {}, confirmation: null };
  }

  return null;
}

let pendingAction = null;

function logMessage(role, text) {
  const log = document.getElementById('ai-log');
  const div = document.createElement('div');
  div.className = role === 'user' ? 'msg-user' : 'msg-ai';
  div.textContent = (role === 'user' ? 'You: ' : 'Assistant: ') + text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function applyAction(action) {
  const map = project.maps[selectedMapIndex];

  if (action.action === 'create_menu') {
    const menu = {
      id: `menu-${Date.now()}`,
      name: action.params.name,
      createdBy: 'ai-assistant',
      layout: action.params.labels.map((label) => ({ type: 'command', label })),
    };
    project.customMenus.push(menu);
    logMessage('ai', `Done. Created "${menu.name}" with commands: ${action.params.labels.join(', ')}.`);
    announce(`Menu created with ${action.params.labels.length} commands.`);
    return;
  }

  if (action.action === 'add_event') {
    const newEvent = {
      id: `evt-${Date.now()}`,
      name: action.params.name,
      x: 0,
      y: 0,
      trigger: 'action',
      commands: action.params.commands,
    };
    map.events.push(newEvent);
    renderMap();
    populateEventSelect();
    logMessage('ai', `Done. Added event "${newEvent.name}" at row 1, column 1. You can move it in the Map Editor tab.`);
    announce(`Event "${newEvent.name}" added to the map.`);
    return;
  }

  if (action.action === 'describe_map') {
    const summary = `Map "${map.name}" is ${map.width} by ${map.height} tiles. Events: ` +
      (map.events.length ? map.events.map((e) => e.name).join(', ') : 'none') + '.';
    logMessage('ai', summary);
    announce(summary);
    return;
  }
}

function renderPendingAction() {
  const container = document.getElementById('ai-pending-action');
  container.innerHTML = '';
  if (!pendingAction) {
    container.innerHTML = '<p>No pending action.</p>';
    return;
  }
  const p = document.createElement('p');
  p.textContent = pendingAction.confirmation;
  container.appendChild(p);

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.addEventListener('click', () => {
    applyAction(pendingAction);
    pendingAction = null;
    renderPendingAction();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    logMessage('ai', 'Okay, cancelled.');
    pendingAction = null;
    renderPendingAction();
  });

  container.appendChild(confirmBtn);
  container.appendChild(cancelBtn);
}

function initAiAssistant() {
  document.getElementById('ai-send').addEventListener('click', () => {
    const input = document.getElementById('ai-input');
    const text = input.value.trim();
    if (!text) return;
    logMessage('user', text);
    input.value = '';

    const result = interpretCommand(text);
    if (!result) {
      logMessage('ai', "I didn't recognize that yet. Try: \"create a menu with Items, Skills, Equip, and Status\" or \"add an event that gives the player a potion\".");
      return;
    }

    if (result.confirmation) {
      pendingAction = result;
      logMessage('ai', result.confirmation + ' (See "Pending Action" below to confirm or cancel.)');
      renderPendingAction();
    } else {
      applyAction(result);
    }
  });
}

// ---------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------
async function init() {
  initTabs();
  initEventEditor();
  initDatabaseEditor();
  initAiAssistant();

  const result = await window.galaga.loadSampleProject();
  if (result.ok) {
    project = result.data;
    renderMap();
    populateEventSelect();
    renderDatabaseList();
    announce('Sample project loaded.');
  }

  document.getElementById('btn-announce-map').addEventListener('click', announceMapSummary);

  window.galaga.onMenu('a11y:announce-map-summary', announceMapSummary);
  window.galaga.onMenu('menu:save-project', async () => {
    const res = await window.galaga.saveProject(project);
    if (res.ok) announce('Project saved.');
  });
  window.galaga.onMenu('menu:open-project', async () => {
    const res = await window.galaga.openProject();
    if (res.ok) {
      project = res.data;
      selectedMapIndex = 0;
      renderMap();
      populateEventSelect();
      renderDatabaseList();
      announce('Project opened.');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

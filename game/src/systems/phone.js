// ============================================================
// PHONE — Rico's phone, on the Tab key.
//
// Contacts (who to call and who calls you), mission calls that
// start jobs, the property ledger, the FM dial, a camera
// shortcut, and a message inbox with toast notifications.
// While the phone is up the streets hold still: the game loop
// feeds it a no-op input until it is pocketed again.
// ============================================================

import { STATION_NAMES, STATION_COLORS } from './radio.js';
import { JOBS, GIVERS } from './missions.js';

// ------------------------------------------------------------
export function createPhone(game) {
  const state = {
    open: false,
    page: 'home',          // home | contacts | messages | property | radio
    cursor: 0,
    unread: 0,
    messages: [],
    contacts: [],
    inCall: null,          // { contact, lines, step, onEnd }
    callT: 0,
    battery: 91,
    history: [],
  };

  // ----------------------------------------------------------
  function registerContact(c) {
    if (!state.contacts.find((x) => x.id === c.id)) {
      state.contacts.push(c);
      return true;
    }
    return false;
  }

  function seedContacts() {
    registerContact({
      id: 'rosa', name: 'Rosa', role: 'Garage', color: '#ff7a3c',
      lines: ['Rico. Work is piling up and my patience is not.', 'Get to the garage before I give your job to somebody who answers.'],
    });
    registerContact({
      id: 'serge', name: 'Serge', role: 'Numbers', color: '#33e7ff',
      lines: ['My ledger does not walk off by itself, Rico.', 'Come by the pawn shop. Bring quiet shoes.'],
    });
    registerContact({
      id: 'marisol', name: 'Marisol', role: 'The Strip', color: '#ff3fa4',
      lines: ['The beach road misses your face in the crowd.', 'One last dance at the plaza — bring the case.'],
    });
    registerContact({
      id: 'roland', name: 'Roland (Tides)', role: 'The Tides', color: '#ff5533',
      lines: ['West water is ours. Splash on our side, we talk.', ' loyalty buys a lot around the boathouse.'],
    });
    registerContact({
      id: 'vera', name: 'Vera (Cinders)', role: 'The Cinders', color: '#33aaff',
      lines: ['The east yard runs clean because we say it does.', 'Roland sends boats. We send fires. Pick a side.'],
    });
    registerContact({
      id: 'marla', name: 'Marla Keene', role: 'Fixer', color: '#c7a23a',
      lines: ['The Coral Crown docks heavy and declares light.', 'The docks job pays like it sounds. Ask me.'],
    });
    registerContact({
      id: 'mom', name: 'Mom', role: 'Family', color: '#9adfff',
      lines: ['Are you eating? The neighbors ask about you.', 'Your cousin got a real job. I said nothing.'],
    });
  }
  seedContacts();

  // ----------------------------------------------------------
  // Messages.
  // ----------------------------------------------------------
  function pushMessage(fromId, text, opts = {}) {
    const from = state.contacts.find((c) => c.id === fromId) ?? {
      id: fromId, name: opts.name ?? fromId, color: opts.color ?? '#ffffff',
    };
    const msg = {
      id: state.messages.length + 1,
      fromId: from.id,
      fromName: from.name,
      color: from.color,
      text,
      read: false,
      urgent: !!opts.urgent,
    };
    state.messages.unshift(msg);
    if (state.messages.length > 40) state.messages.pop();
    if (!state.open) {
      state.unread++;
      game.toast?.(text, from.color);
    }
    game.audio?.blip?.(980);
    return msg;
  }

  function markAllRead() {
    state.unread = 0;
    for (const m of state.messages) m.read = true;
  }

  // ----------------------------------------------------------
  // Mission call: the next giver calls, Rico picks up, job starts.
  // ----------------------------------------------------------
  function incomingMissionCall() {
    const m = game.missions;
    if (m.active || m.done || m.cursor >= JOBS.length) return false;
    const giver = GIVERS[m.cursor];
    const job = JOBS[m.cursor];
    state.inCall = {
      contact: state.contacts.find((c) => c.name.startsWith(giver.name)) ?? { name: giver.name, color: '#ffd977' },
      lines: [job.brief],
      step: 0,
      onEnd: () => {
        m.begin(m.cursor);
        pocket();
      },
    };
    state.callT = 0;
    open('contacts');
    return true;
  }

  function heistCall() {
    state.inCall = {
      contact: state.contacts.find((c) => c.id === 'marla'),
      lines: [
        'The Coral Crown job. Docks, four stages, real money.',
        'Office first, then the skiff at Pier C, then you run.',
        'Say the word and I light the fuse.',
      ],
      step: 0,
      onEnd: () => {
        game.heists.start();
        pocket();
      },
    };
    state.callT = 0;
    open('contacts');
    return true;
  }

  function advanceCall() {
    const call = state.inCall;
    if (!call) return;
    call.step++;
    if (call.step >= call.lines.length) endCall();
  }

  function endCall() {
    const call = state.inCall;
    state.inCall = null;
    if (call?.onEnd) call.onEnd();
  }

  // ----------------------------------------------------------
  // Open / close / navigation.
  // ----------------------------------------------------------
  function open(page) {
    state.open = true;
    state.page = page ?? 'home';
    state.cursor = 0;
    if (state.page === 'messages') markAllRead();
  }

  function pocket() {
    state.open = false;
    state.inCall = null;
  }

  function toggle() {
    if (state.open) pocket();
    else open('home');
  }

  function navigate(dir) {
    const items = pageItems();
    if (!items.length) return;
    state.cursor = (state.cursor + dir + items.length) % items.length;
  }

  function activate() {
    const item = pageItems()[state.cursor];
    if (item?.action) item.action(item);
  }

  function back() {
    if (state.page !== 'home') {
      state.page = 'home';
      state.cursor = 0;
    } else {
      pocket();
    }
  }

  // ----------------------------------------------------------
  // Page items.
  // ----------------------------------------------------------
  function pageItems() {
    const prop = game.property;
    switch (state.page) {
      case 'home':
        return [
          { label: 'Dial — next job', sub: missionDialLabel(), action: () => incomingMissionCall() },
          { label: `Messages${state.unread ? ` (${state.unread})` : ''}`, sub: 'Inbox', action: () => open('messages') },
          { label: 'Property', sub: prop ? 'Ledger and deeds' : 'No agent', action: () => open('property') },
          { label: 'Radio', sub: 'The FM dial', action: () => open('radio') },
          { label: 'Camera', sub: 'Photo mode (P)', action: () => { pocket(); game.photoMode.toggle(); } },
        ];
      case 'contacts':
        return [
          ...state.contacts.map((c) => ({
            label: c.name, sub: c.role, color: c.color,
            action: () => {
              state.inCall = { contact: c, lines: c.lines, step: 0, onEnd: null };
              state.callT = 0;
            },
          })),
          ...(game.heists.available() ? [{ label: 'Marla — docks job', sub: 'The Coral Crown Job', color: '#c7a23a', action: () => heistCall() }] : []),
          { label: 'Back', sub: '', action: () => back() },
        ];
      case 'property': {
        if (!prop) return [{ label: 'No property agent', sub: '', action: () => back() }];
        const data = prop.menuData();
        const items = [];
        if (data.pending > 0) {
          items.push({
            label: `Collect $${Math.round(data.pending).toLocaleString()}`,
            sub: 'Passive income, banked and waiting',
            color: '#7dffa4',
            action: () => prop.collect(),
          });
        }
        for (const o of data.owned) {
          items.push({
            label: o.name,
            sub: `Owned — banked $${Math.round(o.banked).toLocaleString()} — garage ${o.cars}/${o.garage}`,
            color: o.color,
            action: () => { /* collect happens at the top item */ },
          });
        }
        for (const f of data.forSale) {
          items.push({
            label: f.name,
            sub: f.affordable ? `For sale — $${f.price.toLocaleString()}` : `For sale — $${f.price.toLocaleString()} (short on cash)`,
            color: f.color,
            action: () => {
              const r = prop.buy(f.id);
              if (!r.ok) pushMessage('realtor', r.reason, { name: 'Realtor', color: '#c7a23a' });
            },
          });
        }
        items.push({ label: 'Back', sub: '', action: () => back() });
        return items;
      }
      case 'radio':
        return [
          ...STATION_NAMES.map((name, i) => ({
            label: name,
            sub: 'Station',
            color: STATION_COLORS[i],
            action: () => {
              while (game.radio.station !== i) game.radio.cycle();
              game.toast?.(`RADIO — ${name}`, STATION_COLORS[i]);
            },
          })),
          { label: 'Back', sub: '', action: () => back() },
        ];
      case 'messages':
        return [
          ...state.messages.map((m) => ({
            label: (m.urgent ? '⚠ ' : '') + m.fromName,
            sub: m.text,
            color: m.color,
            action: () => {},
          })),
          { label: 'Back', sub: '', action: () => back() },
        ];
      default:
        return [];
    }
  }

  function missionDialLabel() {
    const m = game.missions;
    if (m.active) return 'Job running';
    if (m.done || m.cursor >= JOBS.length) return 'Free roam — nobody is calling';
    return `Call ${GIVERS[m.cursor].name} — ${JOBS[m.cursor].title}`;
  }

  // ----------------------------------------------------------
  function update(dt) {
    if (state.inCall) {
      state.callT += dt;
      if (state.callT > 3.4) {
        state.callT = 0;
        const call = state.inCall;
        call.step++;
        if (call.step >= call.lines.length) endCall();
      }
    }
    state.battery = Math.max(4, state.battery - dt * 0.008);
  }

  /** The game loop routes tapped keys here while the phone is open. */
  function onKey(code) {
    switch (code) {
      case 'ArrowUp': case 'KeyW': navigate(-1); return true;
      case 'ArrowDown': case 'KeyS': navigate(1); return true;
      case 'Enter': case 'Space': case 'KeyE':
        if (state.inCall) advanceCall();
        else activate();
        return true;
      case 'KeyQ': case 'Backspace': back(); return true;
      case 'Tab': pocket(); return true;
      default: return false;
    }
  }

  return {
    state,
    update,
    onKey,
    open,
    pocket,
    toggle,
    registerContact,
    pushMessage,
    incomingMissionCall,
    heistCall,
    advanceCall,
    markAllRead,
    pageItems,
  };
}

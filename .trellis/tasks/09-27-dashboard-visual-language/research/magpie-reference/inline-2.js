
// The routing demo: requests travel from the agent through magpie to the
// account the chosen strategy picks; one that can't answer sends the request
// back to magpie, which tries the next.
(() => {
  const rt = document.getElementById("rt");
  if (!rt) return;
  const $ = (s) => rt.querySelector(s);
  const stage = $(".rt-stage"), svg = $(".rt-wires"), src = $(".rt-src"), hub = $(".rt-hub"), list = $(".rt-accts");
  const cap = $(".rt-cap"), desc = $(".rt-mode"), chip = hub.querySelector("i");
  const stat = [...rt.querySelectorAll(".rt-stats b")], statName = [...rt.querySelectorAll(".rt-stats span")].map((e) => e.lastChild);
  const who = src.querySelector("small");
  const tabs = [...rt.querySelectorAll(".rt-tabs button")];
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  // Two Claude subscriptions and three other vendors' accounts, each with
  // its vendor's icon; the captions name them by plan.
  const V = {
    claude: ["me@work.dev", "Claude Max", "claude-color", "Claude Max", ""],
    claude2: ["me@home.dev", "Claude Pro", "claude-color", "Claude Pro", ""],
    gpt: ["me@home.dev", "ChatGPT Pro", "openai", "ChatGPT Pro", "bird"],
    or: ["sk-or-…4f2a", "OpenRouter", "openrouter", "The OpenRouter key", "bird"],
    gh: ["octo-dev", "Copilot Business", "githubcopilot", "Copilot", "bird"],
  };
  const A = (v, used, inc, x = {}) => { const [who, plan, icon, name, cls] = V[v]; return { who, plan, icon, name, cls, used, inc, ...x }; };
  // A group's models, each with the rule that sends a turn to it; the first
  // takes what no rule matches.
  const G = (who, plan, icon, cls, rule, short) => ({ who, plan, icon, cls, rule, short, used: 0, inc: 0, key: 1 });
  const MODES = {
    intent: {
      name: "By intent", n: 0, stats: ["turns", "asked the classifier", "tool rounds kept on their model"],
      desc: "By intent: as a turn begins, a small fast model (the group's classifier) is asked once which of your rules' intents the message is. The turn goes to that rule's model; its tool rounds stay there, without asking again.",
      accts: () => [
        G("claude-opus-5-5", "Claude Max", "claude-color", "", "first · whatever no rule takes"),
        G("deepseek-v4-flash", "DeepSeek", "deepseek-color", "", "intent · a quick question", "quick question"),
        G("glm-5.3", "Zhipu GLM", "zhipu-color", "", "intent · writing or fixing tests", "tests"),
        G("kimi-k3", "Kimi", "kimi", "bird", "intent · reviewing a diff", "review"),
      ],
      turns: [
        ["Add a --dry-run flag to the deploy command", 0, 2],
        ["What does ^\\d{3}-\\d{4}$ match?", 1, 0],
        ["TestRouting fails after my change — fix it", 2, 2],
        ["Review my staged changes before I commit", 3, 1],
        ["Why does useEffect run twice in dev?", 1, 0],
        ["Write table-driven tests for parseTokens", 2, 1],
        ["Refactor the retry loop into its own function", 0, 1],
      ],
    },
    smart: {
      name: "Smart", n: 30,
      desc: "Smart, the default: the account that resets soonest goes first, so no allowance is left to go to waste; any that can't answer are passed over. (Here each request stands for an hour.)",
      first: (a) => `${a.name} resets in ${fmt(left(a))} — soonest, so it goes first: what it has left is used, not lost at the reset.`,
      accts: () => [
        A("claude", 72, 1.5, { r: 9 }),
        A("claude2", 38, 3, { r: 48, fail: { at: 3, code: 429, rest: 7000 } }),
        A("gpt", 30, 3, { r: 96 }),
        A("or", 0, 0, { key: 1, fail: { at: 0, code: 402 } }),
        A("gh", 24, 2, { r: 288, fail: { at: 4, code: 503, rest: 5000 } }),
      ],
    },
    order: {
      name: "In order", n: 18,
      desc: "In order: the first answers everything until it can't; then the next takes over.",
      first: (a) => `${a.name} answers everything, for as long as it can.`,
      accts: () => [A("claude", 76, 3), A("claude2", 44, 3), A("gpt", 30, 3), A("or", 0, 0, { key: 1 }), A("gh", 24, 2)],
    },
    turn: {
      name: "In turn", n: 16,
      desc: "In turn: each request goes to the next account, so the load is spread evenly.",
      first: () => "Each request goes to the next account in turn.",
      accts: () => [A("claude", 30, 2), A("claude2", 40, 2), A("gpt", 52, 2), A("or", 0, 0, { key: 1 }), A("gh", 18, 2)],
    },
    least: {
      name: "Least used", n: 18,
      desc: "Least used first: each request goes to the account with the most allowance left; a key by the tokens magpie sent it lately.",
      first: () => "Each request goes to whichever has the most left — watch the bars even out.",
      accts: () => [A("claude", 64, 6), A("claude2", 30, 6), A("gpt", 22, 6), A("or", 40, 6, { key: 1, bar: 1 }), A("gh", 46, 6)],
    },
  };

  let mode, M, accts = [], t = 0, gen = 0, next = 0, sent = 0, done = 0, rerouted = 0, errs = 0, ptr = 0;
  let hours = 0; // the demo's clock in smart mode: an hour a request
  const left = (a) => a.r - hours, fmt = (h) => h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
  let began = 0, last = null, trips = [], capQ = [], capAt = -1e9, capLo = false, endAt = 0, wSrc, vis = true;

  const resting = (a) => a.until > t;
  const path = () => { const p = document.createElementNS(NS, "path"); svg.appendChild(p); return p; };
  const tick = (el) => { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); };
  const travel = (dot, p, rev, dur) => new Promise((res) => trips.push({ dot, p, rev, t0: t, dur: still ? 0 : dur, res, g: gen }));
  const wait = (ms) => travel(null, null, false, ms);
  // A caption about a failure goes ahead of the small ones ("takes over", "is back").
  const say = (s, lo) => {
    if (lo && capQ.length) return;
    if (!lo) capQ = capQ.filter((c) => !c.lo);
    capQ.push({ s, lo });
    if (capQ.length > 2) capQ.shift();
  };

  function layout() {
    const r = stage.getBoundingClientRect();
    const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left - r.left, r: b.right - r.left, t: b.top - r.top, b: b.bottom - r.top, cx: (b.left + b.right) / 2 - r.left, cy: (b.top + b.bottom) / 2 - r.top }; };
    svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    const s = box(src), h = box(hub);
    wSrc.setAttribute("d", h.l > s.r ? `M${s.r} ${s.cy} L${h.l} ${h.cy}` : `M${s.cx} ${s.b} L${h.cx} ${h.t}`);
    for (const a of accts) {
      const b = box(a.li);
      if (b.l > h.r) {
        const mx = (h.r + b.l) / 2;
        a.wire.setAttribute("d", `M${h.r} ${h.cy} C${mx} ${h.cy} ${mx} ${b.cy} ${b.l} ${b.cy}`);
      } else { // the accounts sit under magpie: a lane down their left
        const x = b.l - 14;
        a.wire.setAttribute("d", `M${h.cx} ${h.b} C${h.cx} ${h.b + 26} ${x} ${h.b + 2} ${x} ${h.b + 28} L${x} ${b.cy - 10} Q${x} ${b.cy} ${b.l} ${b.cy}`);
      }
    }
  }

  function reset(m) {
    gen++; mode = m; M = MODES[m]; accts = M.accts();
    sent = done = rerouted = errs = ptr = began = hours = 0; last = null; endAt = 0; trips = []; capQ = [];
    next = t + 600;
    list.innerHTML = accts.map((a) => `<li><i class="dot"></i><b><img${a.cls ? ` class="${a.cls}"` : ""} src="/icons/${a.icon}.svg" alt="">${a.who} <span>${a.plan}</span></b><em></em><div class="bar"><i></i></div><span class="tag"></span></li>`).join("");
    svg.innerHTML = "";
    wSrc = path();
    accts.forEach((a, i) => {
      a.li = list.children[i]; a.st = a.li.querySelector("em"); a.bi = a.li.querySelector(".bar i"); a.tg = a.li.querySelector(".tag");
      a.li.classList.toggle("nobar", !!a.key && !a.bar);
      a.wire = path(); a.served = 0; a.until = 0;
    });
    layout();
    list.classList.toggle("models", !!M.turns);
    desc.textContent = M.desc; chip.textContent = M.name; who.textContent = "your agent";
    (M.stats || ["requests", "rerouted", "errors your agent saw"]).forEach((n, i) => (statName[i].textContent = n));
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === m)));
    show(M.turns ? "Claude Code sends every turn to one model name — a magpie group. Watch where each message goes." : "Claude Code sends every request to magpie; magpie decides which account answers it.");
    stats(); render();
  }

  function show(c) { capLo = !!c.lo; const s = c.s || c; cap.textContent = s; cap.classList.remove("in"); void cap.offsetWidth; cap.classList.add("in"); capAt = t; }
  function stats() { stat[0].textContent = done; stat[1].textContent = rerouted; stat[2].textContent = errs; }

  function pick() {
    const ok = accts.filter((a) => !resting(a));
    if (!ok.length) return null;
    switch (mode) {
      case "smart": return ok.filter((a) => a.used < 90).sort((x, y) => (x.r ?? 1e9) - (y.r ?? 1e9))[0] || ok.slice().sort((x, y) => x.used - y.used)[0];
      case "order": return ok[0];
      case "least": return ok.slice().sort((x, y) => x.used - y.used)[0];
      default:
        for (let i = 0; i < accts.length; i++) {
          const a = accts[(ptr + i) % accts.length];
          if (!resting(a)) { ptr = (accts.indexOf(a) + 1) % accts.length; return a; }
        }
    }
  }

  function respond(a) {
    if (resting(a)) return a.code;
    if (a.fail && !a.failed && a.served >= a.fail.at) { a.failed = 1; return a.fail.code; }
    if (!a.key && a.used >= 100) return "quota";
    return 200;
  }

  function serve(a) {
    const was = a.used;
    a.served++; a.used = Math.min(100, a.used + a.inc);
    if (last !== a) {
      if (!began) began = 1, say(M.first(a));
      else if (mode === "smart" && a.used >= 90) say(`The others are resting, so ${a.name.replace(/^The /, "the ")} answers — running low beats no answer.`);
      else if (mode === "smart" && a.r) say(`${a.name} takes over — it resets next, in ${fmt(left(a))}.`, true);
      else if (mode === "smart" || mode === "order") say(`${a.name} takes over.`, true);
      last = a;
    }
    if (mode === "smart" && was < 90 && a.used >= 90) say(`${a.name} is at ${Math.round(a.used)}% — kept for last. The next with quota to spare takes over.`);
    if (mode !== "smart") return;
    hours++;
    for (const b of accts) if (b.r && left(b) <= 0) { // its week renews: now the last to reset
      const lost = Math.round(100 - b.used);
      b.used = 0; b.r += 168;
      say(`${b.name}'s week renewed with only ${lost}% unused — it went first, so little was lost. It resets last now; the next to reset takes over.`);
      if (last === b) last = null;
    }
  }

  const TAGS = { 429: "429 · rate limited", 402: "402 · no credit", 503: "503 · failed", quota: "429 · quota used up" };
  function fail(a, code) {
    a.li.classList.remove("hit"); void a.li.offsetWidth; a.li.classList.add("hit", "tagged");
    a.tg.textContent = TAGS[code];
    setTimeout(() => a.li.classList.remove("tagged"), 1500);
    if (resting(a)) return; // it was already out when the request got there
    a.code = code;
    next = Math.max(next, t + 1500); // a moment to read what happened
    if (code === 429) { a.why = "rate"; a.until = t + a.fail.rest; say(`${a.name} answered 429 — it rests for as long as the vendor asks, and the request is retried on the next at once.`); }
    if (code === 402) { a.why = "credit"; a.until = Infinity; say(`${a.name} is out of credit — it sits out half an hour, and the request moves on. Claude Code never sees the error.`); }
    if (code === 503) { a.why = "fail"; a.until = t + a.fail.rest; say(`${a.name} failed — it steps back a while, longer each time it fails again. Another account answers instead.`); }
    if (code === "quota") { a.why = "quota"; a.until = Infinity; say(`${a.name} is out of quota — passed over until it resets. The request goes to the next.`); }
    if (last === a) last = null;
  }

  async function request(g) {
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", 4.5); dot.setAttribute("class", "pkt"); dot.setAttribute("cx", -20);
    svg.appendChild(dot); tick(src);
    await travel(dot, wSrc, false, 380);
    for (let tries = 0; g === gen && tries < 8; tries++) {
      const a = pick();
      if (!a) { await wait(400); continue; }
      tick(hub);
      await travel(dot, a.wire, false, 420);
      if (g !== gen) return;
      const code = respond(a);
      if (code === 200) {
        serve(a);
        dot.classList.add("back"); dot.setAttribute("r", 4);
        await travel(dot, a.wire, true, 360);
        await travel(dot, wSrc, true, 320);
        if (g !== gen) return;
        dot.remove(); done++; stats(); return;
      }
      fail(a, code); rerouted++; stats();
      await travel(dot, a.wire, true, 300);
    }
    if (g !== gen) return;
    dot.remove(); done++; errs++; stats();
  }

  // By intent: a turn's first request is classified, once; its tool rounds
  // follow it to the same model.
  async function turns(g) {
    const trip = async (a) => {
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("r", 4.5); dot.setAttribute("class", "pkt"); dot.setAttribute("cx", -20);
      svg.appendChild(dot); tick(src);
      await travel(dot, wSrc, false, 380);
      if (g !== gen) return dot.remove();
      tick(hub);
      if (!a) return dot;
      await travel(dot, a.wire, false, 420);
      if (g !== gen) return dot.remove();
      last = a; a.served++;
      dot.classList.add("back"); dot.setAttribute("r", 4);
      await travel(dot, a.wire, true, 360);
      await travel(dot, wSrc, true, 320);
      dot.remove();
    };
    for (const [msg, n, rounds] of M.turns) {
      if (g !== gen) return;
      const a = accts[n];
      who.textContent = "new turn"; chip.textContent = "new turn";
      show(`A new turn: “${msg}”`);
      const dot = await trip(null);
      if (g !== gen) return;
      chip.textContent = "classifying…";
      await wait(900);
      if (g !== gen) return dot?.remove();
      rerouted++; stats();
      chip.textContent = n ? a.short : "no intent";
      a.li.classList.remove("hit"); void a.li.offsetWidth; a.li.classList.add("tagged");
      a.tg.textContent = n ? "✓ " + a.short : "✓ the group's first";
      setTimeout(() => a.li.classList.remove("tagged"), 1600);
      show(n ? `The classifier says: ${a.rule.replace("intent · ", "")} — so ${a.who} answers it.` : `None of the intents — it goes to the group's first model, ${a.who}.`);
      await travel(dot, a.wire, false, 420);
      if (g !== gen) return dot.remove();
      last = a; a.served++;
      dot.classList.add("back"); dot.setAttribute("r", 4);
      await travel(dot, a.wire, true, 360);
      await travel(dot, wSrc, true, 320);
      dot.remove(); done++; stats();
      for (let i = 0; i < rounds; i++) {
        if (g !== gen) return;
        who.textContent = "tool result";
        chip.textContent = "same turn";
        if (!i) show(`Its tool results come back as more requests — no new question: they stay on ${a.who}.`);
        await trip(a);
        errs++; stats();
      }
      await wait(rounds ? 700 : 1300);
    }
    if (g !== gen) return;
    who.textContent = "your agent"; chip.textContent = M.name;
    show(`${done} turns, each on the model its rule names — one question to the classifier per turn, ${errs} tool rounds kept on their model.`);
    await wait(4600);
    if (g === gen) reset(mode);
  }

  function render() {
    if (M.turns) {
      for (const a of accts) {
        if (a.st.textContent !== a.rule) a.st.textContent = a.rule;
        a.li.classList.toggle("on", last === a);
        a.wire.classList.toggle("live", last === a);
      }
      wSrc.classList.toggle("live", !!last);
      return;
    }
    for (const a of accts) {
      const rest = resting(a), n = Math.round(a.used), s = Math.ceil((a.until - t) / 1000);
      const label = rest
        ? { rate: `rate limited · back in ${s} s`, fail: `failing · back in ${s} s`, credit: "out of credit · back in 30 m", quota: "out of quota · resets 3 PM" }[a.why]
        : last === a ? (mode === "smart" && a.used >= 90 ? "serving · running low" : "serving")
        : a.key ? (a.bar ? `${n}% of tokens lately` : "pay as you go")
        : mode === "smart" && a.used >= 90 ? `${n}% used · kept for last`
        : mode === "smart" && a.r ? `${n}% used · resets in ${fmt(left(a))}` : `${n}% used`;
      if (a.st.textContent !== label) a.st.textContent = label;
      a.bi.style.width = a.used + "%";
      a.li.classList.toggle("on", last === a && !rest);
      a.li.classList.toggle("low", mode === "smart" && a.used >= 90);
      a.li.classList.toggle("rest", rest);
      a.wire.classList.toggle("live", last === a && !rest);
      a.wire.classList.toggle("rest", rest);
    }
    wSrc.classList.toggle("live", !!last);
  }

  function step() {
    if (M.turns && !sent && t >= next) { sent = 1; turns(gen); }
    if (sent < M.n && t >= next) { sent++; request(gen); next = t + (still ? 1400 : 900); }
    const now = trips; trips = [];
    for (const tr of now) {
      if (tr.g !== gen) continue;
      const k = tr.dur ? Math.min(1, (t - tr.t0) / tr.dur) : 1;
      if (tr.dot) {
        const e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const len = tr.p.getTotalLength(), pt = tr.p.getPointAtLength((tr.rev ? 1 - e : e) * len);
        tr.dot.setAttribute("cx", pt.x); tr.dot.setAttribute("cy", pt.y);
      }
      if (k >= 1) tr.res(); else trips.push(tr);
    }
    for (const a of accts) if (a.until && a.until !== Infinity && t >= a.until) {
      a.until = 0;
      say(`${a.name} is back — ${a.why === "rate" ? "its rate limit is over" : "it gets another chance"}.`, true);
    }
    if (capQ.length && t - capAt > (capLo && !capQ[0].lo ? 700 : 2200)) show(capQ.shift());
    if (!M.turns && done >= M.n && !endAt) {
      endAt = t + 4200;
      capQ = []; show(`${done} requests answered, ${rerouted} rerouted — and not one error reached Claude Code.`);
    }
    if (endAt && t >= endAt) reset(mode);
    render();
  }

  let prev = 0;
  function frame(now) {
    const dt = Math.min(now - (prev || now), 50); prev = now;
    if (vis && !document.hidden) { t += dt; step(); }
    requestAnimationFrame(frame);
  }

  tabs.forEach((b) => b.addEventListener("click", () => reset(b.dataset.mode)));
  new IntersectionObserver((es) => { vis = es[0].isIntersecting; }).observe(rt);
  new ResizeObserver(() => layout()).observe(stage);
  reset("intent");
  requestAnimationFrame(frame);
})();

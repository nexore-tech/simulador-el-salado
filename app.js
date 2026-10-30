// ============================================================
// Simulador Planta El Salado (RioSal) — abastecimiento por radios
// y balance mensual de la planta. Datos en data/datos_salado.js
// (generados por tools/preparar_datos_salado.py).
// ============================================================
(function () {
  "use strict";

  let D = null;   // datos del simulador: los entrega quien llama a window.iniciarSimulador
  const LB_T = 2204.62262;
  const CLAVE = "simSalado.v1";

  const MENAS = { oxido: "Óxido", mixto: "Mixto", cu_sd: "Cu sin tipo", sulfuro: "Sulfuro", oro: "Oro", otro: "Otro" };
  const TIPOS = { rajo: "Rajo", subterranea: "Subterránea", baja_ley: "Baja ley / desmonte", lavadero: "Lavadero" };
  const ESTADOS = { "ACTIVA": "Activa", "IRREGULAR": "Irregular", "NO ACTIVA": "No activa" };
  const COLORES_BANDA = ["#1a9850", "#66bd63", "#a6d96a", "#fdae61", "#f46d43", "#d73027", "#a50026", "#67001f"];
  const COLOR_CARPETA = { Pavimento: "#3b4252", Ripio: "#c27c0e", Tierra: "#8c5a2b", "Sin dato": "#9aa3ad" };

  const DEF = {
    radios: "10, 25, 50, 100, 150",
    medida: "camino",
    menas: { oxido: true, mixto: false, cu_sd: false, sulfuro: false, oro: false, otro: false },
    estados: { "ACTIVA": true, "IRREGULAR": true, "NO ACTIVA": false },
    tipos: { rajo: true, subterranea: true, baja_ley: false, lavadero: false },   // etapa actual: minas, no desmontes
    maxAcceso: 10,
    maxKm: 150,
    // planta
    capacidad: 4900,      // sin DIA: bajo 5.000 t/mes (umbral SEIA para plantas de beneficio)
    limiteSinDIA: 5000,
    ripiosTmes: 0,        // etapa actual: sin ripios (se pueden volver a activar)
    ripiosStock: 0, ripiosLey: 0.45, ripiosRec: 55, ripiosCosto: 0, ripiosManejo: 1.5,   // stock y pago reales: D.parametros
    rec: { oxido: 75, mixto: 45, cu_sd: 55, sulfuro: 10, oro: 20, otro: 20 },
    acidoKgT: 30, acidoUsdT: 160,
    feTCu: 2.0, feUsdT: 300,
    opVarUsdT: 6, arriendoUF: 0, ufClp: 40000,   // arriendo real: D.parametros
    // costos fijos US$/mes, planta de ~160 t/día operando 24/7 en 3 turnos
    fijos: { personal: 45600, supervision: 22000, laboratorio: 8000, mantencion: 10000,
             energia: 5000, transporte: 9000, otros: 8000 },
    // mercado
    cuUsdLb: 6.51, tc: 925.25,
    pagablePrec: 85, leyPrec: 70, fletePrecUsdT: 45,
    // compra de mineral
    pagoPct: 40,
    ley: { oxido: 1.25, mixto: 1.5, cu_sd: 1.5, sulfuro: 1.8, oro: 1.0, otro: 1.0 },
    leyObjMin: 1.0, leyObjMax: 1.5,   // rango de ley buscado para la mina que alimente la planta
    mesesVida: 36,                    // vida mínima de la mina para dimensionar reservas
    leyBajaLey: 0.7,      // desmontes y acopios de baja ley: tope a la ley por defecto
    tmes: { rajo: 600, subterranea: 300, baja_ley: 400, lavadero: 100 },
    // explotación propia (arriendo de la mina + operación): costos por tipo de faena
    modoDef: "propia",
    mina: {
      rajo:        { fijo: 26000, var: 7,   cap: 2000, explo: 60000 },
      subterranea: { fijo: 17000, var: 18,  cap: 800,  explo: 40000 },
      baja_ley:    { fijo: 8000,  var: 2.5, cap: 1500, explo: 10000 },
      lavadero:    { fijo: 5000,  var: 4,   cap: 300,  explo: 8000 },
    },
    regaliaPct: 5, mesesAmort: 24,
    camionT: 28, velKmH: 35, horasCarga: 1.5, horasDia: 20, diasMes: 26,
    // flete
    fleteClpTkm: 160, recargoAcceso: 2, cargaUsdT: 2, fletePaga: "planta",
    rutasPlan: true,
  };

  // ---------------- estado ----------------
  let P, ov, plan;
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function mezclar(base, extra) {
    const r = clonar(base);
    for (const k in extra || {}) {
      if (r[k] && typeof r[k] === "object" && !Array.isArray(r[k])) Object.assign(r[k], extra[k]);
      else if (k in r) r[k] = extra[k];
    }
    return r;
  }
  function cargar() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch (e) { s = null; }
    P = mezclar(DEF, s && s.P);
    ov = (s && s.ov) || {};
    plan = new Set((s && s.plan) || []);
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify({ P, ov, plan: [...plan] })); } catch (e) { /* sin almacenamiento */ }
  }

  // ---------------- utilidades ----------------
  const fmt = (v, d = 0) => (v == null || !isFinite(v)) ? "–" : v.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = (v, d = 0) => (v < 0 ? "−" : "") + "US$ " + fmt(Math.abs(v), d);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = id => document.getElementById(id);

  function decodificar(str) {
    const pts = []; let i = 0, lat = 0, lon = 0;
    while (i < str.length) {
      for (const k of [0, 1]) {
        let b, sh = 0, r = 0;
        do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
        const d = (r & 1) ? ~(r >> 1) : (r >> 1);
        if (k === 0) lat += d; else lon += d;
      }
      pts.push([lat / 1e5, lon / 1e5]);
    }
    return pts;
  }

  function radios() {
    const r = P.radios.split(/[;, ]+/).map(Number).filter(v => v > 0).sort((a, b) => a - b);
    return r.length ? [...new Set(r)] : [50];
  }
  const dist = m => P.medida === "camino" ? m.km_total : m.km_recto;
  function banda(m) {
    const r = radios(), d = dist(m);
    for (let i = 0; i < r.length; i++) if (d <= r[i]) return i;
    return r.length;
  }
  const colorBanda = i => i >= radios().length ? "#9aa3ad" : COLORES_BANDA[i % COLORES_BANDA.length];
  function tipoPrincipal(m) {
    for (const t of ["rajo", "subterranea", "baja_ley", "lavadero"]) if (m.tipos.includes(t)) return t;
    return m.tipos[0];
  }
  const tMes = m => (ov[m.id] && ov[m.id].t != null) ? ov[m.id].t : P.tmes[tipoPrincipal(m)] || 0;
  const leyMina = m => (ov[m.id] && ov[m.id].ley != null) ? ov[m.id].ley
    : tipoPrincipal(m) === "baja_ley" ? Math.min(P.ley[m.mena] || 0, P.leyBajaLey) : P.ley[m.mena] || 0;
  const modoMina = m => (ov[m.id] && ov[m.id].modo) || P.modoDef;
  const fijosPlantaMes = () => Object.values(P.fijos).reduce((a, b) => a + b, 0) + (P.tc ? P.arriendoUF * P.ufClp / P.tc : 0);
  const fijoPlantaT = () => P.capacidad > 0 ? fijosPlantaMes() / P.capacidad : 0;

  // ---------------- motor económico (por tonelada) ----------------
  function economia(ley, recPct, extra) {
    const cuContLb = ley / 100 * LB_T;
    const cuRecLb = cuContLb * recPct / 100;
    const ingreso = cuRecLb * P.cuUsdLb * P.pagablePrec / 100;
    const acido = P.acidoKgT * P.acidoUsdT / 1000;
    const chatarra = cuRecLb / LB_T * P.feTCu * P.feUsdT;
    const fletePrec = cuRecLb / LB_T / (P.leyPrec / 100) * P.fletePrecUsdT;
    const proceso = acido + chatarra + P.opVarUsdT + fletePrec;
    return Object.assign({ cuContLb, cuRecLb, ingreso, acido, chatarra, fletePrec, opVar: P.opVarUsdT, proceso }, extra || {});
  }
  // Evalúa una faena. opt: { t, ley, kLey, modo, km } para curvas y sensibilidades.
  function evaluar(m, opt) {
    opt = opt || {};
    const t = opt.t != null ? opt.t : tMes(m);
    const ley = (opt.ley != null ? opt.ley : leyMina(m)) * (opt.kLey || 1);
    const modo = opt.modo || modoMina(m);
    const e = economia(ley, P.rec[m.mena] || 0);
    const tarifa = P.fleteClpTkm / P.tc;
    const kmTotal = opt.km != null ? opt.km : m.km_total;
    const kmAcc = Math.min(m.km_enganche, kmTotal);
    const kmRed = Math.max(kmTotal - kmAcc, 0);
    e.kmRed = kmRed; e.kmAcc = kmAcc;
    e.fleteRed = kmRed * tarifa;
    e.fleteAcc = kmAcc * P.recargoAcceso * tarifa;
    e.carga = P.cargaUsdT;
    e.flete = e.fleteRed + e.fleteAcc + e.carga;
    e.viajes = t / P.camionT;
    e.cicloH = 2 * kmTotal / P.velKmH + P.horasCarga;
    e.camiones = e.viajes * e.cicloH / (P.horasDia * P.diasMes);
    const valorCont = e.cuContLb * P.cuUsdLb;
    if (modo === "propia") {
      const c = P.mina[tipoPrincipal(m)];
      e.modulos = Math.max(1, Math.ceil(t / c.cap));
      e.minaFijoMes = c.fijo * e.modulos; e.exploMes = P.mesesAmort > 0 ? c.explo * e.modulos / P.mesesAmort : 0; e.minaVar = c.var;
      e.regalia = valorCont * P.regaliaPct / 100; e.compra = 0; e.fletePlanta = e.flete; e.cap = c.cap;
    } else {
      e.minaFijoMes = 0; e.exploMes = 0; e.minaVar = 0; e.regalia = 0; e.cap = Infinity;
      e.compra = valorCont * P.pagoPct / 100;
      e.fletePlanta = P.fletePaga === "planta" ? e.flete : 0;
    }
    e.fijoMinaMes = e.minaFijoMes + e.exploMes;
    e.costoMinaT = t > 0 ? e.fijoMinaMes / t + e.minaVar + e.regalia + e.compra : 0;
    e.contribT = e.ingreso - e.proceso - e.fletePlanta - e.compra - e.minaVar - e.regalia;
    e.margenMes = e.contribT * t - e.fijoMinaMes;
    e.margen = t > 0 ? e.margenMes / t : -e.fijoMinaMes;        // US$/t antes de fijos de planta
    e.margenNeto = e.margen - fijoPlantaT();                       // con fijos de planta prorrateados
    e.netoMinero = e.compra - (modo === "compra" && P.fletePaga === "minero" ? e.flete : 0);
    e.modo = modo; e.t = t; e.ley = ley;
    return e;
  }
  // Ley a la que el margen de la faena es cero (el margen es lineal en la ley).
  function leyEquilibrio(m, t, campo) {
    campo = campo || "margen";
    const l0 = Math.max(leyMina(m), 0.5);
    const a = evaluar(m, { t, ley: l0 })[campo], b = evaluar(m, { t, ley: l0 + 1 })[campo];
    return b > a ? Math.max(l0 - a / (b - a), 0) : null;
  }
  function radioEconomico() {
    // km por camino a los que una faena tipo (óxido, subterránea si es propia) deja margen cero antes de fijos de planta
    const propia = P.modoDef === "propia";
    const e = economia(P.ley.oxido, P.rec.oxido);
    const tarifa = P.fleteClpTkm / P.tc;
    const valor = e.cuContLb * P.cuUsdLb;
    let base;
    if (propia) {
      const c = P.mina.subterranea, t = Math.min(P.tmes.subterranea, c.cap);
      base = e.ingreso - e.proceso - c.var - valor * P.regaliaPct / 100 - (c.fijo + c.explo / P.mesesAmort) / t - P.cargaUsdT;
    } else {
      const compra = valor * P.pagoPct / 100;
      base = P.fletePaga === "planta" ? e.ingreso - e.proceso - compra - P.cargaUsdT : compra - P.cargaUsdT;
    }
    return { km: base > 0 ? base / tarifa : 0, quien: propia ? "propia" : P.fletePaga };
  }

  // ---------------- filtros ----------------
  function pasaFiltro(m) {
    return P.menas[m.mena] && P.estados[m.estado] && m.tipos.some(t => P.tipos[t])
      && m.km_camino_cercano <= P.maxAcceso && dist(m) <= P.maxKm;
  }

  // ---------------- simulación del plan ----------------
  function simular(kLey) {
    kLey = kLey || 1;
    const minas = D.minas.filter(m => plan.has(m.id)).map(m => ({ m, e: evaluar(m, { kLey }) }));
    const ripT = Math.min(P.ripiosTmes, P.capacidad, P.ripiosStock);
    const tMinas = minas.reduce((s, x) => s + x.e.t, 0);
    const disp = Math.max(P.capacidad - ripT, 0);
    const factor = tMinas > disp && tMinas > 0 ? disp / tMinas : 1;
    const r = { ripT, tMinas, factor, tTotal: ripT + tMinas * factor, n: minas.length, mezcla: [],
      cuCont: 0, cuRec: 0, ingreso: 0, compra: 0, flete: 0, acido: 0, chatarra: 0, opVar: 0, fletePrec: 0, ripios: 0,
      minaFijo: 0, explo: 0, minaVar: 0, regalia: 0, camiones: 0, nPropias: 0 };
    const sumar = (e, t) => {
      r.cuCont += e.cuContLb * t; r.cuRec += e.cuRecLb * t; r.ingreso += e.ingreso * t;
      r.acido += e.acido * t; r.chatarra += e.chatarra * t; r.opVar += e.opVar * t; r.fletePrec += e.fletePrec * t;
    };
    if (ripT > 0) {
      const e = economia(P.ripiosLey * kLey, P.ripiosRec);
      sumar(e, ripT); r.ripios = (P.ripiosCosto + P.ripiosManejo) * ripT;
      r.mezcla.push({ nombre: "Ripios RioSal", modo: "ripios", t: ripT, ley: P.ripiosLey * kLey, rec: P.ripiosRec, km: 0 });
    }
    for (const x of minas) {
      const t = x.e.t * factor;
      sumar(x.e, t);
      r.compra += x.e.compra * t; r.flete += x.e.fletePlanta * t;
      r.minaVar += x.e.minaVar * t; r.regalia += x.e.regalia * t;
      r.minaFijo += x.e.minaFijoMes; r.explo += x.e.exploMes; r.camiones += x.e.camiones * factor;
      if (x.e.modo === "propia") r.nPropias++;
      r.mezcla.push({ nombre: x.m.nombre, id: x.m.id, modo: x.e.modo, t, ley: x.e.ley, rec: P.rec[x.m.mena] || 0, km: x.m.km_total });
    }
    r.fijo = Object.values(P.fijos).reduce((a, b) => a + b, 0);
    r.arriendo = P.tc ? P.arriendoUF * P.ufClp / P.tc : 0;
    r.costoMina = r.minaFijo + r.explo + r.minaVar + r.regalia + r.compra;
    r.costos = r.costoMina + r.flete + r.acido + r.chatarra + r.opVar + r.fletePrec + r.ripios + r.fijo + r.arriendo;
    r.ebitda = r.ingreso - r.costos;
    r.leyMedia = r.tTotal ? r.cuCont / LB_T / r.tTotal * 100 : 0;
    r.cuFinoT = r.cuRec / LB_T;
    r.precT = r.cuFinoT / (P.leyPrec / 100);
    r.costoLb = r.cuRec ? r.costos / r.cuRec : 0;
    r.vidaRipios = ripT ? P.ripiosStock / ripT : null;
    return r;
  }
  // Ley media de alimentación a la que el EBITDA es cero (escalando todas las leyes de la mezcla).
  function leyEquilibrioPlan(r) {
    if (!r.tTotal) return null;
    const f = k => simular(k).ebitda;
    let lo = 0, hi = 1;
    while (f(hi) < 0 && hi < 64) hi *= 2;
    if (f(hi) < 0) return null;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
    return r.leyMedia * hi;
  }

  // Reparte la capacidad libre (después de ripios) entre las faenas que pasan los filtros.
  // En explotación propia cada faena toma hasta su capacidad: concentrar tonelaje diluye su costo fijo.
  function autollenar() {
    const ripT = Math.min(P.ripiosTmes, P.capacidad, P.ripiosStock);
    let resto = P.capacidad - ripT;
    plan = new Set();
    const tObjetivo = m => Math.min(modoMina(m) === "propia" ? P.mina[tipoPrincipal(m)].cap : P.tmes[tipoPrincipal(m)], resto);
    const cand = D.minas.filter(pasaFiltro)
      .map(m => ({ m, e: evaluar(m, { t: tObjetivo(m) }) }))
      .filter(x => x.e.margen > 0 && x.e.t > 0)
      .sort((a, b) => b.e.margen - a.e.margen);
    for (const x of cand) {
      if (resto < 50) break;
      const t = Math.floor(Math.min(tObjetivo(x.m), resto) / 50) * 50;
      if (t <= 0 || evaluar(x.m, { t }).margen <= 0) continue;
      ov[x.m.id] = Object.assign(ov[x.m.id] || {}, { t });
      plan.add(x.m.id); resto -= t;
    }
    render();
  }

  // ---------------- panel de parámetros ----------------
  function campo(ruta, etiqueta, unidad, paso, ayuda) {
    const v = ruta.split(".").reduce((o, k) => o[k], P);
    return `<div class="campo"><label for="f-${ruta}">${etiqueta}${unidad ? ` <small>${unidad}</small>` : ""}${ayuda ? `<small>${ayuda}</small>` : ""}</label>
      <input id="f-${ruta}" data-ruta="${ruta}" type="number" step="${paso || "any"}" value="${v}"></div>`;
  }
  function chks(grupo, opciones) {
    return `<div class="chks">${Object.entries(opciones).map(([k, l]) =>
      `<label class="chk"><input type="checkbox" data-grupo="${grupo}" data-k="${k}" ${P[grupo][k] ? "checked" : ""}> ${l}</label>`).join("")}</div>`;
  }
  function seg(nombre, opciones) {
    return `<div class="seg" data-seg="${nombre}">${Object.entries(opciones).map(([k, l]) =>
      `<button type="button" data-v="${k}" class="${P[nombre] === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  }
  function panel() {
    $("panel").innerHTML = `
    <details><summary>Antecedentes de RioSal</summary>
      <ul class="ayuda" style="padding-left:16px;margin:4px 0">
        ${(D.antecedentes || []).map(a => `<li>${a}</li>`).join("")}
      </ul>
    </details>
    <details open><summary>Radios y filtros</summary>
      <div class="campo ancho"><label for="f-radios">Radios <small>km, separados por coma</small></label>
        <input id="f-radios" type="text" value="${esc(P.radios)}"></div>
      <div class="ayuda">Medir la distancia:</div>
      ${seg("medida", { camino: "Por camino", recto: "Línea recta" })}
      ${campo("maxKm", "Distancia máxima", "km", 5)}
      ${campo("maxAcceso", "Distancia máx. al camino más cercano", "km", 0.5, "faenas más lejos de la red MOP se excluyen")}
      <h3>Tipo de mena</h3>${chks("menas", MENAS)}
      <h3>Estado (catastro)</h3>${chks("estados", ESTADOS)}
      <h3>Tipo de faena</h3>${chks("tipos", TIPOS)}
    </details>
    <details open><summary>Planta</summary>
      ${campo("capacidad", "Capacidad", "t/mes", 100, "sin DIA: menos de 5.000 t/mes")}
      ${campo("acidoKgT", "Consumo de ácido", "kg/t", 1)}
      ${campo("acidoUsdT", "Precio ácido", "US$/t", 5)}
      ${campo("feTCu", "Chatarra de fierro", "t Fe / t Cu", 0.1, "precipitación de cobre cemento")}
      ${campo("feUsdT", "Precio chatarra", "US$/t", 10)}
      ${campo("opVarUsdT", "Otros costos variables", "US$/t", 0.5, "energía, agua, mano de obra variable")}
      <h3>Costos fijos (US$/mes)</h3>
      ${campo("fijos.personal", "Personal de operación", "US$/mes", 1000, "24 personas en 3 turnos × US$ 1.900 costo empresa")}
      ${campo("fijos.supervision", "Supervisión y administración", "US$/mes", 1000, "jefe de planta, 4 jefes de turno, administrativo, prevencionista, bodeguero")}
      ${campo("fijos.laboratorio", "Laboratorio químico", "US$/mes", 500, "químico, 2 muestreros, reactivos y análisis externos")}
      ${campo("fijos.mantencion", "Mantención fija", "US$/mes", 500, "mecánico, eléctrico, repuestos")}
      ${campo("fijos.energia", "Energía (cargo fijo y demanda)", "US$/mes", 500)}
      ${campo("fijos.transporte", "Transporte, camionetas y alimentación", "US$/mes", 500)}
      ${campo("fijos.otros", "Seguros, permisos, seguridad, oficina", "US$/mes", 500)}
      ${campo("arriendoUF", "Arriendo de la planta", "UF/mes", 10)}
      ${campo("ufClp", "Valor UF", "CLP", 100)}
      <h3>Recuperación de Cu por mena (%)</h3>
      ${Object.keys(MENAS).map(k => campo("rec." + k, MENAS[k], "%", 1)).join("")}
    </details>
    <details><summary>Ripios en la planta (no se usan en esta etapa)</summary>
      <div class="ayuda">Ripios oxidados acopiados en el recinto de la planta. La ley es un supuesto.</div>
      ${campo("ripiosStock", "Stock", "t", 10000)}
      ${campo("ripiosTmes", "Alimentación", "t/mes", 500)}
      ${campo("ripiosLey", "Ley Cu", "%", 0.05)}
      ${campo("ripiosRec", "Recuperación", "%", 1)}
      ${campo("ripiosCosto", "Pago al dueño de los ripios", "US$/t", 0.1)}
      ${campo("ripiosManejo", "Carguío y manejo de ripios", "US$/t", 0.5)}
    </details>
    <details><summary>Producto y mercado</summary>
      ${campo("cuUsdLb", "Precio Cu", "US$/lb", 0.01)}
      ${campo("tc", "Tipo de cambio", "CLP/US$", 1)}
      ${campo("leyPrec", "Ley del precipitado", "% Cu", 1)}
      ${campo("pagablePrec", "Pagable del precipitado", "% del valor Cu", 1)}
      ${campo("fletePrecUsdT", "Flete del precipitado", "US$/t prec.", 1)}
    </details>
    <details open><summary>Explotación de minas</summary>
      <div class="ayuda">Modalidad por defecto (cada faena se puede cambiar en su ficha o en la tabla):</div>
      ${seg("modoDef", { propia: "Explotación propia", compra: "Compra al minero" })}
      <div class="ayuda">Explotación propia: Goldberg arrienda la mina, la explora, la habilita y la opera, y paga regalía al dueño.
        El costo por tonelada baja con el tonelaje porque el costo fijo se reparte.</div>
      <h3>Mina buscada</h3>
      ${campo("leyObjMin", "Ley mínima", "% Cu", 0.05)}
      ${campo("leyObjMax", "Ley máxima", "% Cu", 0.05)}
      ${campo("mesesVida", "Vida mínima", "meses", 6, "para dimensionar las reservas a explorar")}
      ${campo("regaliaPct", "Regalía al dueño", "% del Cu contenido", 0.5)}
      ${campo("mesesAmort", "Amortización de exploración", "meses", 1)}
      ${Object.keys(TIPOS).map(k => `<h3>${TIPOS[k]}</h3>
        ${campo("mina." + k + ".fijo", "Costo fijo", "US$/mes", 1000, "dotación, equipos arrendados, polvorín, seguridad")}
        ${campo("mina." + k + ".var", "Costo variable", "US$/t", 0.5, "perforación, explosivos, combustible, carguío")}
        ${campo("mina." + k + ".cap", "Capacidad por módulo", "t/mes", 50, "sobre esto se suma otro módulo de costo fijo y exploración")}
        ${campo("mina." + k + ".explo", "Exploración y habilitación", "US$", 1000, "muestreo, trincheras, sondajes cortos, proyecto Sernageomin")}`).join("")}
      <h3>Camiones</h3>
      ${campo("camionT", "Capacidad del camión", "t", 1)}
      ${campo("velKmH", "Velocidad media", "km/h", 1)}
      ${campo("horasCarga", "Carga, pesaje y descarga", "h/viaje", 0.1)}
      ${campo("horasDia", "Horas de operación", "h/día", 1)}
      ${campo("diasMes", "Días de operación", "días/mes", 1)}
    </details>
    <details><summary>Compra de mineral y flete</summary>
      ${campo("pagoPct", "Pago al minero", "% del valor del Cu contenido", 1)}
      <div class="ayuda">Flete del mineral lo paga:</div>
      ${seg("fletePaga", { planta: "La planta", minero: "El minero" })}
      ${campo("fleteClpTkm", "Tarifa flete", "CLP/t·km", 5)}
      ${campo("recargoAcceso", "Recargo tramo fuera de la red", "× tarifa", 0.1, "huella desde la faena al camino MOP")}
      ${campo("cargaUsdT", "Carguío y pesaje", "US$/t", 0.5)}
      <h3>Ley por defecto (% Cu)</h3>
      ${Object.keys(MENAS).map(k => campo("ley." + k, MENAS[k], "%", 0.1)).join("")}
      ${campo("leyBajaLey", "Tope para baja ley / desmonte", "%", 0.05, "faenas que solo tienen acopios o desmontes")}
      <h3>Producción por defecto (t/mes)</h3>
      ${Object.keys(TIPOS).map(k => campo("tmes." + k, TIPOS[k], "t/mes", 50)).join("")}
      <div class="ayuda">La ley y las t/mes de cada faena se pueden editar en la tabla.</div>
    </details>
    <details><summary>Mapa</summary>
      <label class="chk"><input type="checkbox" id="f-rutasPlan" ${P.rutasPlan ? "checked" : ""}> Dibujar las rutas de las faenas del plan</label>
      <div class="ayuda">Las capas de relaves y del botadero se activan en el control de capas del mapa.</div>
    </details>`;
  }
  function enlazarPanel() {
    $("panel").addEventListener("input", ev => {
      const el = ev.target;
      if (el.id === "f-radios") { P.radios = el.value; return programar(); }
      if (el.dataset.ruta) {
        const ks = el.dataset.ruta.split("."), v = parseFloat(el.value);
        if (!isFinite(v)) return;
        const dueno = ks.slice(0, -1).reduce((o, k) => o[k], P);
        dueno[ks[ks.length - 1]] = v;
        programar();
      }
    });
    $("panel").addEventListener("change", ev => {
      const el = ev.target;
      if (el.dataset.grupo) { P[el.dataset.grupo][el.dataset.k] = el.checked; render(); }
      if (el.id === "f-rutasPlan") { P.rutasPlan = el.checked; render(); }
    });
    $("panel").addEventListener("click", ev => {
      const b = ev.target.closest(".seg button");
      if (!b) return;
      const s = b.parentElement.dataset.seg;
      P[s] = b.dataset.v;
      b.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      render();
    });
  }
  let temporizador = null;
  function programar() { clearTimeout(temporizador); temporizador = setTimeout(render, 180); }

  // ---------------- mapa ----------------
  let mapa, capaMinas, capaRadios, capaRuta, capaRutasPlan, marcadores = {};
  function iniciarMapa() {
    mapa = L.map("mapa", { preferCanvas: true }).setView([D.planta.lat, D.planta.lon], 10);
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 18, attribution: "© OpenStreetMap" });
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, attribution: "Esri World Imagery" });
    const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      { maxZoom: 17, attribution: "© OpenTopoMap" });
    osm.addTo(mapa);

    const red = L.layerGroup();
    const rend = L.canvas({ padding: 0.3 });
    for (const [poly, carpeta, rol, nombre] of D.red) {
      L.polyline(decodificar(poly), { renderer: rend, color: COLOR_CARPETA[carpeta] || COLOR_CARPETA["Sin dato"],
        weight: carpeta === "Pavimento" ? 2.2 : 1.3, opacity: .8, interactive: false }).addTo(red);
    }
    red.addTo(mapa);

    capaRadios = L.layerGroup().addTo(mapa);
    capaRutasPlan = L.layerGroup().addTo(mapa);
    capaMinas = L.layerGroup().addTo(mapa);
    capaRuta = L.layerGroup().addTo(mapa);

    const enami = L.layerGroup().addTo(mapa);
    for (const e of D.enami) {
      L.marker([e.lat, e.lon], { icon: L.divIcon({ className: "", html:
        '<div style="width:12px;height:12px;background:#2b5cab;border:2px solid #fff;box-shadow:0 0 0 1px #2b5cab"></div>', iconSize: [12, 12] }) })
        .bindTooltip(`ENAMI · ${esc(e.nombre)}`).addTo(enami);
    }
    L.marker([D.planta.lat, D.planta.lon], { zIndexOffset: 1000, icon: L.divIcon({ className: "", html:
      '<div style="font-size:26px;line-height:26px;color:#b5541c;text-shadow:0 0 3px #fff,0 0 3px #fff">★</div>', iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindTooltip(`<b>${esc(D.planta.nombre)}</b><br>${esc(D.planta.proceso)}`).addTo(mapa);

    const sitio = L.layerGroup().addTo(mapa);
    if (D.botadero) {
      L.polygon(D.botadero.levantamiento, { color: "#7a4b12", weight: 1.5, fillOpacity: .25 })
        .bindTooltip("Sector de ripios (levantamiento 2013)").addTo(sitio);
      L.polygon(D.botadero.proyectado, { color: "#b5541c", weight: 1.5, dashArray: "5 4", fillOpacity: .1 })
        .bindTooltip("Botadero proyectado 200 × 100 m (informe de estabilidad 2013)").addTo(sitio);
    }
    const relaves = L.layerGroup();
    for (const r of D.relaves || []) {
      const cu = r.cu_pct || 0;
      L.marker([r.lat, r.lon], { icon: L.divIcon({ className: "", iconSize: [14, 14], iconAnchor: [7, 7],
        html: `<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid ${cu >= 0.3 ? "#6a1b9a" : "#b39ddb"};filter:drop-shadow(0 0 1px #fff)"></div>` }) })
        .bindPopup(`<div class="popup"><h4>${esc(r.deposito)}</h4><div class="muted">${esc(r.empresa)} · ${esc(r.faena)} · ${esc(r.comuna)}</div>
          <table><tr><td>Recurso</td><td>${esc(r.recurso)} · ${esc(r.estado)}</td></tr>
          <tr><td>Masa</td><td>${r.masa_t ? fmt(r.masa_t) + " t" : "sin dato"}</td></tr>
          <tr><td>Cu total</td><td>${fmt(r.cu_pct, 3)} % (${r.muestras} muestra/s)</td></tr>
          <tr><td>Au</td><td>${r.au_gt == null ? "–" : fmt(r.au_gt, 2) + " g/t"}</td></tr>
          <tr><td>Distancia</td><td>${fmt(r.km_recto, 1)} km recta · ${fmt(r.km_total, 1)} km por camino</td></tr></table>
          <div class="muted">Catastro geoquímico de relaves Sernageomin 2019. Cu total, no soluble.</div></div>`, { maxWidth: 320 })
        .addTo(relaves);
    }
    L.control.layers({ "Topográfico": topo, "Calles (OSM)": osm, "Satélite": sat },
      { "Red vial MOP 2019": red, "Plantas ENAMI": enami, "Rutas del plan": capaRutasPlan,
        "Ripios y botadero RioSal": sitio, "Relaves (Sernageomin 2019)": relaves }, { collapsed: true }).addTo(mapa);
    L.control.scale({ imperial: false }).addTo(mapa);
  }

  function dibujarRadios() {
    capaRadios.clearLayers();
    radios().forEach((r, i) => {
      L.circle([D.planta.lat, D.planta.lon], { radius: r * 1000, color: colorBanda(i), weight: 1.5, dashArray: "6 5",
        fill: false, interactive: false }).addTo(capaRadios);
      const lat = D.planta.lat + r / 111.32;
      L.marker([lat, D.planta.lon], { interactive: false, icon: L.divIcon({ className: "", iconSize: [60, 16], iconAnchor: [30, 8],
        html: `<div style="text-align:center;font:600 11px system-ui;color:${colorBanda(i)};text-shadow:0 0 3px #fff,0 0 3px #fff">${r} km</div>` }) })
        .addTo(capaRadios);
    });
  }

  function popup(m) {
    const e = evaluar(m), en = plan.has(m.id);
    const via = m.via_cercana || {};
    return `<div class="popup"><h4>${esc(m.nombre)}</h4>
      <div class="muted">${esc(m.empresa)} · ${esc(m.comuna)}</div>
      <table>
        <tr><td>Mena</td><td>${MENAS[m.mena]} · ${esc(m.mineral)}</td></tr>
        <tr><td>Estado</td><td>${ESTADOS[m.estado]} · ${m.tipos.map(t => TIPOS[t]).join(", ")} · ${m.labores} labor(es)</td></tr>
        <tr><td>Línea recta</td><td>${fmt(m.km_recto, 1)} km</td></tr>
        <tr><td>Camino más cercano</td><td>${fmt(m.km_camino_cercano, 2)} km · ${esc(via.rol || via.nombre || "sin rol")} (${esc(via.carpeta || "")})</td></tr>
        <tr><td>Por camino</td><td><b>${fmt(m.km_total, 1)} km</b> (factor ${fmt(m.km_total / Math.max(m.km_recto, 0.1), 2)})</td></tr>
        <tr><td>ENAMI más cercana</td><td>${esc(m.enami_cercana || "–")} · ${fmt(m.km_enami, 1)} km</td></tr>
        <tr><td>Supuesto</td><td>${fmt(e.t)} t/mes · ${fmt(e.ley, 2)} % Cu</td></tr>
        <tr><td>Flete</td><td>${usd(e.flete, 1)}/t (${P.fletePaga === "planta" ? "paga la planta" : "paga el minero"})</td></tr>
        <tr><td>${e.modo === "propia" ? "Costo mina" : "Pago al minero"}</td><td>${usd(e.costoMinaT, 1)}/t (${e.modo === "propia" ? "explotación propia" : "compra"})</td></tr>
        <tr><td>Margen neto</td><td class="${e.margenNeto >= 0 ? "pos" : "neg"}"><b>${usd(e.margenNeto, 1)}/t</b> · ${usd(e.margenNeto * e.t)}/mes</td></tr>
      </table>
      <button type="button" data-plan="${m.id}">${en ? "Quitar del plan" : "Agregar al plan"}</button></div>`;
  }
  function mostrarRuta(m) {
    capaRuta.clearLayers();
    L.polyline(decodificar(m.ruta), { color: "#b5541c", weight: 4, opacity: .9 }).addTo(capaRuta);
    L.polyline([[m.lat, m.lon], m.eng], { color: "#b42318", weight: 3, dashArray: "4 5" })
      .bindTooltip(`Tramo fuera de la red: ${fmt(m.km_enganche, 2)} km`).addTo(capaRuta);
  }
  function dibujarMinas(lista) {
    capaMinas.clearLayers(); capaRutasPlan.clearLayers(); marcadores = {};
    for (const m of lista) {
      const b = banda(m), enPlan = plan.has(m.id);
      const mk = L.circleMarker([m.lat, m.lon], {
        radius: enPlan ? 7 : 5, color: enPlan ? "#111" : "#fff", weight: enPlan ? 2.5 : 1,
        fillColor: colorBanda(b), fillOpacity: m.estado === "ACTIVA" ? .95 : .55,
      }).bindTooltip(`${esc(m.nombre)} · ${fmt(m.km_total, 1)} km por camino`);
      mk.on("click", () => { mostrarRuta(m); mk.bindPopup(popup(m), { maxWidth: 340 }).openPopup(); selId = m.id; fichaCompleta(); });
      mk.addTo(capaMinas);
      marcadores[m.id] = mk;
      if (enPlan && P.rutasPlan) {
        L.polyline(decodificar(m.ruta), { color: "#5b2a86", weight: 1.6, opacity: .55, interactive: false }).addTo(capaRutasPlan);
      }
    }
  }
  function leyenda() {
    const r = radios();
    const filas = r.map((v, i) => `<div class="fila"><i style="background:${colorBanda(i)}"></i> ≤ ${v} km ${P.medida === "camino" ? "por camino" : "en línea recta"}</div>`);
    if (P.maxKm > r[r.length - 1]) filas.push(`<div class="fila"><i style="background:#9aa3ad"></i> > ${r[r.length - 1]} km</div>`);
    $("leyenda").innerHTML = filas.join("")
      + `<div class="fila" style="margin-top:4px"><i style="background:#fff;border:2.5px solid #111"></i> en el plan · opaco = activa</div>`
      + `<div class="fila"><i class="sq" style="background:#2b5cab"></i> planta ENAMI · <span style="color:#b5541c">★</span> RioSal · <span style="color:#6a1b9a">▲</span> relave</div>`
      + `<div class="fila">${Object.entries(COLOR_CARPETA).map(([k, c]) => `<i class="ln" style="background:${c}"></i>${k}`).join(" ")}</div>`;
  }

  // ---------------- KPIs, bandas, balance ----------------
  function kpi(l, v, s, cls) { return `<div class="kpi ${cls || ""}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`; }
  function kpis(r) {
    const uso = P.capacidad ? r.tTotal / P.capacidad * 100 : 0;
    $("kpis").innerHTML =
      kpi("Alimentación", fmt(r.tTotal) + " t/mes", `${fmt(uso)} % de capacidad · ${fmt(r.ripT)} t ripios + ${fmt(r.tMinas * r.factor)} t de ${r.n} faenas`
        + (P.capacidad >= P.limiteSinDIA ? `<br><b class="neg">Requiere DIA: la planta no tiene</b>` : ""), P.capacidad >= P.limiteSinDIA ? "neg" : "")
      + kpi("Ley de alimentación", fmt(r.leyMedia, 2) + " % Cu", `equilibrio (EBITDA = 0): ${r.leyEq == null ? "–" : fmt(r.leyEq, 2) + " %"} · Cu fino ${fmt(r.cuFinoT, 1)} t/mes`,
          r.leyEq != null && r.leyMedia < r.leyEq ? "neg" : "")
      + kpi("Precipitado", fmt(r.precT, 1) + " t/mes", `a ${fmt(P.leyPrec)} % Cu`)
      + kpi("Ingresos", usd(r.ingreso), "por mes")
      + kpi("EBITDA", usd(r.ebitda), `${usd(r.ebitda * 12)} al año`, r.ebitda >= 0 ? "pos" : "neg")
      + kpi("Costo total", (r.cuRec ? "US$ " + fmt(r.costoLb, 2) : "–") + " /lb", `precio ${fmt(P.cuUsdLb, 2)} US$/lb`)
      + (r.ripT ? kpi("Vida de ripios", fmt(r.vidaRipios / 12, 1) + " años", `${fmt(P.ripiosStock)} t en stock`)
               : kpi("Ripios", "No se usan", "etapa actual: alimentación desde mina"));
  }
  function bandas(filtradas) {
    const r = radios();
    const base = D.minas.filter(m => P.menas[m.mena] && P.estados[m.estado] && m.tipos.some(t => P.tipos[t]) && m.km_camino_cercano <= P.maxAcceso);
    const filas = r.map((v, i) => {
      const recta = base.filter(m => m.km_recto <= v);
      const cam = base.filter(m => m.km_total <= v);
      const ev = cam.map(m => evaluar(m));
      const pos = ev.filter(e => e.margen > 0);
      const t = ev.reduce((s, e) => s + e.t, 0), tPos = pos.reduce((s, e) => s + e.t, 0);
      const acc = cam.length ? cam.reduce((s, m) => s + m.km_camino_cercano, 0) / cam.length : null;
      const enPlan = cam.filter(m => plan.has(m.id)).length;
      return `<tr><td class="txt"><span class="dot" style="background:${colorBanda(i)}"></span> ≤ ${v} km</td>
        <td>${fmt(recta.length)}</td><td><b>${fmt(cam.length)}</b></td><td>${fmt(cam.filter(m => m.estado === "ACTIVA").length)}</td>
        <td>${fmt(t)}</td><td>${fmt(pos.length)}</td><td>${fmt(tPos)}</td><td>${fmt(acc, 2)}</td><td>${fmt(enPlan)}</td></tr>`;
    });
    const re = radioEconomico();
    $("bandas").innerHTML = `<h2>Faenas por radio (acumulado)</h2>
      <p class="muted" style="margin:4px 0 8px">Con los filtros de mena, estado, tipo y distancia al camino. "Por camino" incluye el tramo
      desde la faena hasta la red MOP en línea recta. Radio económico para un óxido de ${fmt(P.ley.oxido, 1)} % Cu:
      <b>${fmt(re.km)} km por camino</b> (${re.quien === "propia" ? "mina subterránea propia a su tonelaje por defecto, margen = 0 antes de fijos de planta" : re.quien === "planta" ? "margen de la planta = 0" : "el flete se come el pago al minero"}).</p>
      <div class="tabla-scroll"><table><thead><tr><th class="txt">Radio</th><th>En línea recta</th><th>Por camino</th><th>Activas</th>
      <th>t/mes potencial</th><th>Con margen &gt; 0</th><th>t/mes con margen</th><th>Km medio al camino</th><th>En el plan</th></tr></thead>
      <tbody>${filas.join("")}</tbody></table></div>`;
  }
  function balance(r) {
    const lb = r.cuRec || 1, t = r.tTotal || 1;
    const items = [
      ["Mina: costos fijos (faenas propias)", r.minaFijo], ["Mina: exploración y habilitación", r.explo],
      ["Mina: costo variable", r.minaVar], ["Regalías a dueños de minas", r.regalia],
      ["Compra de mineral a terceros", r.compra], ["Flete de mineral", r.flete], ["Ripios (pago + manejo)", r.ripios],
      ["Ácido sulfúrico", r.acido], ["Chatarra de fierro", r.chatarra], ["Otros variables", r.opVar],
      ["Flete del precipitado", r.fletePrec], ["Arriendo de la planta", r.arriendo], ["Costos fijos (dotación y servicios)", r.fijo],
    ];
    const max = Math.max(...items.map(x => x[1]), 1);
    $("balance").innerHTML = `<div class="grid2"><div><h2>Balance mensual</h2>
      <table style="margin-top:8px"><thead><tr><th class="txt">Concepto</th><th>US$/mes</th><th>US$/t</th><th>US$/lb Cu</th><th class="txt" style="width:30%"></th></tr></thead><tbody>
      <tr><td class="txt"><b>Ingresos por precipitado</b></td><td><b>${fmt(r.ingreso)}</b></td><td>${fmt(r.ingreso / t, 1)}</td><td>${fmt(r.ingreso / lb, 2)}</td><td></td></tr>
      ${items.map(([k, v]) => `<tr><td class="txt">${k}</td><td>${fmt(v)}</td><td>${fmt(v / t, 1)}</td><td>${fmt(v / lb, 2)}</td>
        <td class="txt"><div class="barra"><span style="width:${v / max * 100}%"></span></div></td></tr>`).join("")}
      <tr><td class="txt"><b>EBITDA</b></td><td class="${r.ebitda >= 0 ? "pos" : "neg"}"><b>${fmt(r.ebitda)}</b></td><td>${fmt(r.ebitda / t, 1)}</td><td>${fmt(r.ebitda / lb, 2)}</td><td></td></tr>
      </tbody></table></div>
      <div><h2>Mezcla de alimentación</h2>
      <div class="tabla-scroll"><table style="margin:8px 0 10px"><thead><tr><th class="txt">Fuente</th><th class="txt">Modalidad</th><th>t/mes</th><th>%</th><th>Ley % Cu</th><th>Cu cont. t</th><th>Rec. %</th><th>km</th></tr></thead><tbody>
      ${r.mezcla.map(x => `<tr><td class="txt nombre">${x.id ? `<a href="#" data-ver="${x.id}">${esc(x.nombre)}</a>` : esc(x.nombre)}</td>
        <td class="txt">${x.modo === "propia" ? "Propia" : x.modo === "compra" ? "Compra" : "Stock propio"}</td>
        <td>${fmt(x.t)}</td><td>${fmt(r.tTotal ? x.t / r.tTotal * 100 : 0, 1)}</td><td>${fmt(x.ley, 2)}</td>
        <td>${fmt(x.t * x.ley / 100, 1)}</td><td>${fmt(x.rec)}</td><td>${fmt(x.km, 1)}</td></tr>`).join("")}
      <tr class="total"><td class="txt"><b>Alimentación</b></td><td></td><td><b>${fmt(r.tTotal)}</b></td><td>100</td>
        <td><b>${fmt(r.leyMedia, 2)}</b></td><td><b>${fmt(r.cuCont / LB_T, 1)}</b></td><td>${fmt(r.cuCont ? r.cuRec / r.cuCont * 100 : 0, 1)}</td><td></td></tr>
      </tbody></table></div>
      <p class="muted">Ley de equilibrio de la alimentación: <b>${r.leyEq == null ? "–" : fmt(r.leyEq, 2) + " % Cu"}</b>
        (todas las leyes de la mezcla escaladas en la misma proporción hasta EBITDA = 0). Camiones requeridos: ${fmt(r.camiones, 1)}.</p>
      <h2>Plan de abastecimiento</h2>
      ${r.factor < 1 ? `<p class="neg">Las faenas del plan suman ${fmt(r.tMinas)} t/mes y superan la capacidad disponible; se procesa el ${fmt(r.factor * 100)} % de cada una.</p>` : ""}
      <p class="muted">${r.n ? `${r.n} faenas en el plan.` : "El plan está vacío: use <b>Llenar capacidad</b> o agregue faenas desde el mapa o la tabla."}
      "Repartir capacidad" reparte la capacidad libre entre las faenas que pasan los filtros, ordenadas por margen por tonelada; en explotación propia cada faena toma hasta su capacidad estimada.</p>
      <table><tbody>
        <tr><td class="txt">Capacidad</td><td>${fmt(P.capacidad)} t/mes</td></tr>
        <tr><td class="txt">Ripios propios</td><td>${fmt(r.ripT)} t/mes</td></tr>
        <tr><td class="txt">Mineral de terceros</td><td>${fmt(r.tMinas * r.factor)} t/mes</td></tr>
        <tr><td class="txt">Capacidad libre</td><td>${fmt(Math.max(P.capacidad - r.tTotal, 0))} t/mes</td></tr>
        <tr><td class="txt">Cu contenido en la alimentación</td><td>${fmt(r.cuCont / LB_T, 1)} t/mes</td></tr>
        <tr><td class="txt">Recuperación global</td><td>${fmt(r.cuCont ? r.cuRec / r.cuCont * 100 : 0, 1)} %</td></tr>
      </tbody></table></div></div>`;
  }

  // ---------------- gráficos de línea (SVG) ----------------
  const SERIE = ["#2a78d6", "#eb6834"];          // slots 1 y 2 de la paleta categórica validada
  const graficos = {};
  function pasoBonito(rango, n) {
    const bruto = rango / n, p = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  // cfg: { id, xs, series: [{ nombre, ys }], fx, fy, xEtiq, marcaX, vLinea: { x, etiq } }
  function grafico(cfg) {
    graficos[cfg.id] = cfg;
    const W = 560, H = 240, ml = 58, mr = 16, mt = 16, mb = 40;
    const xs = cfg.xs, x0 = xs[0], x1 = xs[xs.length - 1];
    const todos = cfg.series.flatMap(s => s.ys).filter(isFinite);
    let y0 = Math.min(0, ...todos), y1 = Math.max(0, ...todos);
    if (y1 === y0) y1 = y0 + 1;
    const paso = pasoBonito(y1 - y0, 4);
    y0 = Math.floor(y0 / paso) * paso; y1 = Math.ceil(y1 / paso) * paso;
    const sx = x => ml + (x - x0) / (x1 - x0) * (W - ml - mr);
    const sy = y => mt + (y1 - y) / (y1 - y0) * (H - mt - mb);
    Object.assign(cfg, { W, H, ml, mr, mt, mb, sx, sy });
    let g = "";
    for (let y = y0; y <= y1 + 1e-9; y += paso) {
      g += `<line x1="${ml}" x2="${W - mr}" y1="${sy(y)}" y2="${sy(y)}" stroke="${Math.abs(y) < 1e-9 ? "#898781" : "#e1e0d9"}" stroke-width="1"/>`
        + `<text x="${ml - 6}" y="${sy(y) + 4}" text-anchor="end" class="eje">${cfg.fy(y)}</text>`;
    }
    const px = pasoBonito(x1 - x0, 5);
    for (let x = Math.ceil(x0 / px) * px; x <= x1 + 1e-9; x += px) {
      g += `<text x="${sx(x)}" y="${H - mb + 16}" text-anchor="middle" class="eje">${cfg.fx(x)}</text>`;
    }
    g += `<text x="${(ml + W - mr) / 2}" y="${H - 6}" text-anchor="middle" class="eje">${cfg.xEtiq}</text>`;
    if (cfg.vLinea && cfg.vLinea.x > x0 && cfg.vLinea.x < x1) {
      const vx = sx(cfg.vLinea.x);
      g += `<line x1="${vx}" x2="${vx}" y1="${mt}" y2="${H - mb}" stroke="#898781" stroke-dasharray="4 4"/>`
        + `<text x="${vx + 4}" y="${mt + 10}" class="eje">${cfg.vLinea.etiq}</text>`;
    }
    cfg.series.forEach((s, i) => {
      const pts = xs.map((x, k) => isFinite(s.ys[k]) ? `${sx(x).toFixed(1)},${sy(s.ys[k]).toFixed(1)}` : null).filter(Boolean).join(" ");
      g += `<polyline points="${pts}" fill="none" stroke="${SERIE[i]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    if (cfg.marcaX != null) {
      cfg.series.forEach((s, i) => {
        const y = interp(xs, s.ys, cfg.marcaX);
        if (isFinite(y)) g += `<circle cx="${sx(cfg.marcaX)}" cy="${sy(y)}" r="5" fill="${SERIE[i]}" stroke="#fff" stroke-width="2"/>`;
      });
    }
    g += `<line class="cruz" x1="0" x2="0" y1="${mt}" y2="${H - mb}" stroke="#898781" stroke-width="1" visibility="hidden"/>`
      + `<rect class="zona" data-graf="${cfg.id}" x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" fill="transparent"/>`;
    const leyenda = cfg.series.length > 1
      ? `<div class="graf-leyenda">${cfg.series.map((s, i) => `<span><i style="background:${SERIE[i]}"></i>${s.nombre}</span>`).join("")}</div>` : "";
    return `<div class="graf" id="graf-${cfg.id}">${leyenda}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.titulo || "")}">${g}</svg><div class="graf-tip" hidden></div></div>`;
  }
  function interp(xs, ys, x) {
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) { const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + f * (ys[i] - ys[i - 1]); }
    }
    return ys[ys.length - 1];
  }
  function enlazarGraficos() {
    document.addEventListener("mousemove", ev => {
      const zona = ev.target.closest && ev.target.closest("rect.zona");
      document.querySelectorAll(".graf").forEach(gr => {
        if (zona && gr.contains(zona)) return;
        gr.querySelector(".cruz").setAttribute("visibility", "hidden"); gr.querySelector(".graf-tip").hidden = true;
      });
      if (!zona) return;
      const cfg = graficos[zona.dataset.graf], gr = zona.closest(".graf"), svg = zona.ownerSVGElement;
      const caja = svg.getBoundingClientRect(), escala = cfg.W / caja.width;
      const xPix = (ev.clientX - caja.left) * escala;
      const x = cfg.xs[0] + (xPix - cfg.ml) / (cfg.W - cfg.ml - cfg.mr) * (cfg.xs[cfg.xs.length - 1] - cfg.xs[0]);
      let k = 0;
      cfg.xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(cfg.xs[k] - x)) k = i; });
      const cruz = gr.querySelector(".cruz");
      cruz.setAttribute("x1", cfg.sx(cfg.xs[k])); cruz.setAttribute("x2", cfg.sx(cfg.xs[k])); cruz.setAttribute("visibility", "visible");
      const tip = gr.querySelector(".graf-tip");
      tip.innerHTML = `<b>${cfg.fx(cfg.xs[k])} ${cfg.xUnidad || ""}</b>` + cfg.series.map((s, i) =>
        `<div><i style="background:${SERIE[i]}"></i>${s.nombre}: <b>${cfg.fy(s.ys[k])}</b></div>`).join("");
      tip.hidden = false;
      const izq = cfg.sx(cfg.xs[k]) / escala;
      tip.style.left = Math.min(izq + 12, caja.width - 190) + "px";
      tip.style.top = "28px";
    });
  }

  // ---------------- ficha de la faena seleccionada ----------------
  let selId = null;
  function seleccionar(id) {
    selId = id;
    fichaCompleta();
    $("ficha").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function fichaCompleta() {
    const el = $("ficha");
    const m = selId != null ? D.minas.find(x => x.id === selId) : null;
    if (!m) {
      el.innerHTML = `<h2>Simulación por faena</h2><p class="muted">Seleccione una faena en el mapa o en la tabla (clic en el nombre)
        para ver sus costos de mina, transporte y planta, y cómo cambian con el tonelaje de extracción y la distancia.</p>`;
      return;
    }
    const e = evaluar(m), tipo = tipoPrincipal(m), cap = P.mina[tipo].cap;
    const tMax = Math.max(P.capacidad, cap * 1.5, e.t * 1.2, 500);
    el.innerHTML = `<div class="ficha-head"><div><h2>${esc(m.nombre)}</h2>
        <div class="muted">${esc(m.empresa)} · ${TIPOS[tipo]} · ${MENAS[m.mena]} · ${ESTADOS[m.estado]} · ${fmt(m.km_total, 1)} km por camino
        (${fmt(m.km_enganche, 2)} km fuera de la red) · ${m.labores} labor(es)</div></div>
        <button type="button" data-cerrar-ficha title="Cerrar">×</button></div>
      <div class="ficha-ctrl">
        <div><div class="ayuda">Modalidad</div>
          <div class="seg" data-fmodo>${[["propia", "Explotación propia"], ["compra", "Compra al minero"]].map(([k, l]) =>
            `<button type="button" data-v="${k}" class="${e.modo === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <label class="ctrl-t"><span>Extracción <b id="ficha-t">${fmt(e.t)}</b> t/mes</span>
          <input type="range" min="50" max="${Math.ceil(tMax / 50) * 50}" step="50" value="${e.t}" data-fov="t"></label>
        <label>Ley Cu % <input type="number" step="0.05" min="0" value="${e.ley}" data-fov="ley"></label>
        <button type="button" data-plan="${m.id}" class="${plan.has(m.id) ? "" : "primary"}">${plan.has(m.id) ? "Quitar del plan" : "Agregar al plan"}</button>
      </div>
      <div id="ficha-cuerpo"></div>`;
    fichaCuerpo();
  }
  function fichaCuerpo() {
    const m = D.minas.find(x => x.id === selId);
    if (!m || !$("ficha-cuerpo")) return;
    const e = evaluar(m), tipo = tipoPrincipal(m), c = P.mina[tipo];
    const fpT = fijoPlantaT(), t = e.t || 1;
    const leq = leyEquilibrio(m, e.t, "margen"), leqN = leyEquilibrio(m, e.t, "margenNeto");
    $("ficha-t").textContent = fmt(e.t);
    // curva vs tonelaje
    const tMax = Math.max(P.capacidad, c.cap * 1.5, e.t * 1.2, 500);
    const t0 = Math.max(100, Math.round(c.cap * 0.2 / 50) * 50);   // bajo esto el costo fijo/t domina la escala
    const ts = []; for (let x = Math.min(t0, e.t); x <= tMax; x += Math.max(25, Math.round(tMax / 80 / 25) * 25)) ts.push(x);
    const eT = ts.map(x => evaluar(m, { t: x }));
    const g1 = grafico({ id: "ton", titulo: "Costo mina y margen según tonelaje", xs: ts, xEtiq: "Extracción (t/mes)", xUnidad: "t/mes",
      fx: x => fmt(x), fy: y => "US$ " + fmt(y, 0),
      series: [{ nombre: e.modo === "propia" ? "Costo mina US$/t" : "Pago al minero US$/t", ys: eT.map(v => v.costoMinaT) },
               { nombre: "Margen neto US$/t", ys: eT.map(v => v.margenNeto) }],
      marcaX: e.t, vLinea: e.modo === "propia" ? { x: c.cap, etiq: "1 módulo" } : null });
    // curva vs distancia
    const dMax = Math.max(150, m.km_total * 1.4);
    const ds = []; for (let d = Math.ceil(m.km_enganche); d <= dMax; d += Math.max(1, Math.round(dMax / 80))) ds.push(d);
    const eD = ds.map(d => evaluar(m, { km: d }));
    let dEq = null;
    for (let i = 1; i < eD.length; i++) if (eD[i - 1].margenNeto >= 0 && eD[i].margenNeto < 0) { dEq = ds[i]; break; }
    const g2 = grafico({ id: "dist", titulo: "Transporte y margen según distancia", xs: ds, xEtiq: "Distancia por camino (km)", xUnidad: "km",
      fx: x => fmt(x), fy: y => "US$ " + fmt(y, 0),
      series: [{ nombre: "Transporte US$/t", ys: eD.map(v => v.flete) }, { nombre: "Margen neto US$/t", ys: eD.map(v => v.margenNeto) }],
      marcaX: m.km_total, vLinea: dEq ? { x: dEq, etiq: "margen 0" } : null });
    const fila = (k, vT, cls) => `<tr class="${cls || ""}"><td class="txt">${k}</td><td>${fmt(vT, 2)}</td><td>${fmt(vT * t)}</td></tr>`;
    const prop = e.modo === "propia";
    const filas = [
      `<tr class="grupo"><td class="txt" colspan="3">Ingreso</td></tr>`,
      fila(`Cu recuperado (${fmt(e.cuRecLb, 1)} lb/t × ${fmt(P.cuUsdLb, 2)} × ${fmt(P.pagablePrec)} %)`, e.ingreso),
      `<tr class="grupo"><td class="txt" colspan="3">Mina</td></tr>`,
      prop ? fila(`Costo fijo (dotación, equipos) · US$ ${fmt(c.fijo)}/mes × ${e.modulos} módulo(s) de ${fmt(c.cap)} t`, e.minaFijoMes / t) : "",
      prop ? fila(`Exploración y habilitación · US$ ${fmt(c.explo)} × ${e.modulos} en ${P.mesesAmort} meses`, e.exploMes / t) : "",
      prop ? fila("Costo variable (perforación, tronadura, carguío)", e.minaVar) : "",
      prop ? fila(`Regalía al dueño (${fmt(P.regaliaPct, 1)} % del Cu contenido)`, e.regalia) : "",
      prop ? "" : fila(`Pago al minero (${fmt(P.pagoPct)} % del Cu contenido)`, e.compra),
      `<tr class="grupo"><td class="txt" colspan="3">Transporte${!prop && P.fletePaga === "minero" ? " (lo paga el minero)" : ""}</td></tr>`,
      fila("Carguío y pesaje", e.fletePlanta ? e.carga : 0),
      fila(`Tramo por la red (${fmt(e.kmRed, 1)} km)`, e.fletePlanta ? e.fleteRed : 0),
      fila(`Tramo fuera de la red (${fmt(e.kmAcc, 2)} km × ${fmt(P.recargoAcceso, 1)})`, e.fletePlanta ? e.fleteAcc : 0),
      `<tr class="grupo"><td class="txt" colspan="3">Planta</td></tr>`,
      fila("Ácido sulfúrico", e.acido), fila("Chatarra de fierro", e.chatarra), fila("Otros variables", e.opVar),
      fila("Flete del precipitado", e.fletePrec),
      fila(`Fijos de planta prorrateados (US$ ${fmt(fijosPlantaMes())}/mes ÷ ${fmt(P.capacidad)} t)`, fpT),
      `<tr class="total"><td class="txt"><b>Margen neto</b></td><td class="${e.margenNeto >= 0 ? "pos" : "neg"}"><b>${fmt(e.margenNeto, 2)}</b></td>
        <td class="${e.margenNeto >= 0 ? "pos" : "neg"}"><b>${fmt(e.margenNeto * t)}</b></td></tr>`,
    ].join("");
    $("ficha-cuerpo").innerHTML = `
      <div class="kpis mini">
        ${kpi(prop ? "Costo mina" : "Pago al minero", usd(e.costoMinaT, 1) + "/t", prop ? `fijo ${usd(e.fijoMinaMes)}/mes ÷ ${fmt(e.t)} t + variable` : "")}
        ${kpi("Transporte", usd(e.flete, 1) + "/t", `${fmt(e.viajes, 0)} viajes/mes · ${fmt(Math.ceil(e.camiones * 10) / 10, 1)} camiones de ${fmt(P.camionT)} t`)}
        ${kpi("Margen neto", usd(e.margenNeto, 1) + "/t", `${usd(e.margenNeto * e.t)}/mes`, e.margenNeto >= 0 ? "pos" : "neg")}
        ${kpi("Ley de equilibrio", leqN == null ? "–" : fmt(leqN, 2) + " % Cu", `sin fijos de planta: ${leq == null ? "–" : fmt(leq, 2) + " %"} · supuesta ${fmt(e.ley, 2)} %`)}
        ${kpi("Distancia de equilibrio", dEq ? fmt(dEq) + " km" : (eD.length && eD[eD.length - 1].margenNeto >= 0 ? "> " + fmt(dMax) + " km" : "–"), "margen neto = 0, misma ley y tonelaje")}
      </div>
      <div class="grid2">
        <div><h3>${prop ? "Costo mina" : "Pago al minero"} y margen según tonelaje</h3>${g1}</div>
        <div><h3>Transporte y margen según distancia</h3>${g2}</div>
      </div>
      <h3 style="margin-top:12px">Costos de esta faena a ${fmt(e.t)} t/mes</h3>
      <table class="ficha-tabla"><thead><tr><th class="txt">Concepto</th><th>US$/t</th><th>US$/mes</th></tr></thead><tbody>${filas}</tbody></table>
      <p class="muted" style="margin-top:6px">Costos de mina por tipo de faena (${TIPOS[tipo]}): fijo ${usd(c.fijo)}/mes, variable ${usd(c.var, 1)}/t,
        capacidad estimada ${fmt(c.cap)} t/mes, exploración ${usd(c.explo)}. Se editan en el panel "Explotación de minas".
        Los fijos de planta se reparten por tonelada a capacidad plena.</p>`;
  }
  function enlazarFicha() {
    const el = $("ficha");
    el.addEventListener("input", ev => {
      const x = ev.target;
      if (!x.dataset.fov || selId == null) return;
      const v = parseFloat(x.value);
      ov[selId] = ov[selId] || {};
      if (isFinite(v)) ov[selId][x.dataset.fov] = v;
      fichaCuerpo();
      programar();
    });
    el.addEventListener("click", ev => {
      if (ev.target.closest("[data-cerrar-ficha]")) { selId = null; fichaCompleta(); return; }
      const b = ev.target.closest("[data-fmodo] button");
      if (b && selId != null) {
        ov[selId] = Object.assign(ov[selId] || {}, { modo: b.dataset.v });
        fichaCompleta(); programar(); return;
      }
      const p = ev.target.closest("button[data-plan]");
      if (p) { alternar(+p.dataset.plan); }
    });
  }


  // ---------------- candidatas a fuente única ----------------
  // faenas de grandes compañías: no están disponibles para arriendo
  const GRAN_MINERIA = /codelco|mantos copper|anglo|bhp|antofagasta minerals|freeport|lundin|kinross|teck|capstone|sierra gorda|caserones|candelaria|enami|empresa nacional de mineria|southern copper|cmp|compa..a minera del pac.fico|sqm|albemarle|glencore|barrick|gold fields|yamana/i;
  function candidatas() {
    const ripT = Math.min(P.ripiosTmes, P.capacidad, P.ripiosStock);
    const t = Math.max(P.capacidad - ripT, 0);
    const lMed = (P.leyObjMin + P.leyObjMax) / 2;
    const lista = D.minas.filter(m => pasaFiltro(m) && !GRAN_MINERIA.test(m.empresa)).map(m => {
      const a = evaluar(m, { t, ley: P.leyObjMin, modo: "propia" });
      const b = evaluar(m, { t, ley: P.leyObjMax, modo: "propia" });
      const c = evaluar(m, { t, ley: lMed, modo: "propia" });
      return { m, a, b, c, leq: leyEquilibrioModo(m, t) };
    }).sort((x, y) => y.c.margenNeto - x.c.margenNeto);
    const viables = lista.filter(x => x.a.margenNeto > 0).length;
    const filas = lista.slice(0, 40).map(x => {
      const m = x.m, cl = v => v >= 0 ? "pos" : "neg";
      return `<tr class="${plan.has(m.id) ? "plan" : ""}">
        <td class="txt nombre"><a href="#" data-ver="${m.id}">${esc(m.nombre)}</a></td>
        <td class="txt">${TIPOS[tipoPrincipal(m)]}</td><td class="txt">${ESTADOS[m.estado]}</td><td>${m.labores}</td>
        <td>${fmt(m.km_total, 1)}</td><td>${fmt(m.km_camino_cercano, 2)}</td><td>${fmt(x.c.modulos)}</td>
        <td>${fmt(x.c.costoMinaT + x.c.fletePlanta, 1)}</td>
        <td class="${cl(x.a.margenNeto)}">${fmt(x.a.margenNeto * t)}</td>
        <td class="${cl(x.b.margenNeto)}">${fmt(x.b.margenNeto * t)}</td>
        <td>${x.leq == null ? "–" : fmt(x.leq, 2)}</td>
        <td><button type="button" data-unica="${m.id}">Alimentar con esta</button></td></tr>`;
    }).join("");
    $("candidatas").innerHTML = `<h2>Candidatas para alimentar la planta</h2>
      <p class="muted" style="margin:4px 0 8px">Cada faena que pasa los filtros, evaluada como <b>fuente única</b> de ${fmt(t)} t/mes en explotación propia,
        con ley de ${fmt(P.leyObjMin, 2)} % y ${fmt(P.leyObjMax, 2)} % Cu. EBITDA de la planta completa (incluye fijos de planta).
        Reservas a explorar para ${P.mesesVida} meses: <b>${fmt(t * P.mesesVida)} t</b>.
        ${fmt(viables)} de ${fmt(lista.length)} faenas dan EBITDA positivo incluso al ${fmt(P.leyObjMin, 2)} %.
        Se excluyen faenas de grandes compañías. El catastro no indica el tamaño de las minas: "labores" es solo una pista; hay que verificar en terreno que puedan sostener este tonelaje.</p>
      <div class="tabla-scroll"><table><thead><tr><th class="txt">Faena</th><th class="txt">Tipo</th><th class="txt">Estado</th><th>Labores</th>
        <th>Km camino</th><th>Al camino km</th><th>Módulos</th><th>Mina + flete US$/t</th>
        <th>EBITDA US$/mes a ${fmt(P.leyObjMin, 2)} %</th><th>EBITDA US$/mes a ${fmt(P.leyObjMax, 2)} %</th><th>Ley equilibrio %</th><th></th></tr></thead>
        <tbody>${filas}</tbody></table></div>`;
  }
  // ley a la que la planta alimentada solo con esta faena (explotación propia) tiene EBITDA cero
  function leyEquilibrioModo(m, t) {
    const a = evaluar(m, { t, ley: 1, modo: "propia" }).margenNeto, b = evaluar(m, { t, ley: 2, modo: "propia" }).margenNeto;
    return b > a ? Math.max(1 - a / (b - a), 0) : null;
  }
  function alimentarCon(id) {
    const ripT = Math.min(P.ripiosTmes, P.capacidad, P.ripiosStock);
    plan = new Set([id]);
    ov[id] = Object.assign(ov[id] || {}, { t: Math.max(P.capacidad - ripT, 0), modo: "propia",
      ley: (P.leyObjMin + P.leyObjMax) / 2 });
    seleccionar(id);
    render();
  }

  // ---------------- tabla ----------------
  let orden = { col: "km", dir: 1 };
  const COLS = [
    ["plan", "", null], ["banda", "", m => banda(m)], ["nombre", "Faena", m => m.nombre], ["empresa", "Empresa", m => m.empresa],
    ["comuna", "Comuna", m => m.comuna], ["mena", "Mena", m => m.mena], ["estado", "Estado", m => m.estado],
    ["tipo", "Tipo", m => tipoPrincipal(m)], ["modo", "Modalidad", m => modoMina(m)], ["recto", "Recta km", m => m.km_recto],
    ["acceso", "Al camino km", m => m.km_camino_cercano], ["km", "Por camino km", m => m.km_total],
    ["factor", "Factor", m => m.km_total / Math.max(m.km_recto, 0.1)], ["enami", "ENAMI más cercana km", m => m.km_enami ?? 1e9],
    ["t", "t/mes", m => tMes(m)], ["ley", "Ley % Cu", m => leyMina(m)],
    ["costo", "Mina + flete US$/t", m => { const e = evaluar(m); return e.costoMinaT + e.fletePlanta; }],
    ["margen", "Margen neto US$/t", m => evaluar(m).margenNeto],
    ["mes", "Margen neto US$/mes", m => { const e = evaluar(m); return e.margenNeto * e.t; }],
  ];
  function tabla(lista) {
    const q = $("buscar").value.trim().toLowerCase(), solo = $("solo-plan").checked;
    let filas = lista.filter(m => (!solo || plan.has(m.id))
      && (!q || (m.nombre + " " + m.empresa + " " + m.comuna).toLowerCase().includes(q)));
    const c = COLS.find(x => x[0] === orden.col);
    if (c && c[2]) filas.sort((a, b) => { const x = c[2](a), y = c[2](b); return (x > y ? 1 : x < y ? -1 : 0) * orden.dir; });
    $("conteo").textContent = `${fmt(filas.length)} faenas`;
    const txt = new Set(["nombre", "empresa", "comuna", "mena", "estado", "tipo", "modo"]);
    const head = "<thead><tr>" + COLS.map(([k, l]) => `<th data-col="${k}" class="${txt.has(k) ? "txt" : ""}">${l}${orden.col === k ? (orden.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("") + "</tr></thead>";
    const body = filas.map(m => {
      const e = evaluar(m), en = plan.has(m.id);
      return `<tr class="${en ? "plan" : ""}" data-id="${m.id}">
        <td><input type="checkbox" data-plan="${m.id}" ${en ? "checked" : ""}></td>
        <td><span class="dot" style="background:${colorBanda(banda(m))}"></span></td>
        <td class="txt nombre"><a href="#" data-ver="${m.id}">${esc(m.nombre)}</a></td>
        <td class="txt nombre">${esc(m.empresa)}</td><td class="txt">${esc(m.comuna)}</td>
        <td class="txt"><span class="chip ${m.mena}">${MENAS[m.mena]}</span></td>
        <td class="txt">${ESTADOS[m.estado]}</td><td class="txt">${TIPOS[tipoPrincipal(m)]}</td>
        <td class="txt"><select data-modo="${m.id}"><option value="propia" ${e.modo === "propia" ? "selected" : ""}>Propia</option><option value="compra" ${e.modo === "compra" ? "selected" : ""}>Compra</option></select></td>
        <td>${fmt(m.km_recto, 1)}</td><td>${fmt(m.km_camino_cercano, 2)}</td><td><b>${fmt(m.km_total, 1)}</b></td>
        <td>${fmt(m.km_total / Math.max(m.km_recto, 0.1), 2)}</td>
        <td title="${esc(m.enami_cercana || "")}">${fmt(m.km_enami, 1)}</td>
        <td><input type="number" step="50" min="0" data-ov="t" data-id="${m.id}" value="${e.t}"></td>
        <td><input type="number" step="0.1" min="0" data-ov="ley" data-id="${m.id}" value="${e.ley}"></td>
        <td>${fmt(e.costoMinaT + e.fletePlanta, 1)}</td>
        <td class="${e.margenNeto >= 0 ? "pos" : "neg"}">${fmt(e.margenNeto, 1)}</td>
        <td class="${e.margenNeto >= 0 ? "pos" : "neg"}">${fmt(e.margenNeto * e.t)}</td></tr>`;
    }).join("");
    $("tabla").innerHTML = head + "<tbody>" + body + "</tbody>";
  }
  function enlazarTabla() {
    $("candidatas").addEventListener("click", ev => {
      const u = ev.target.closest("[data-unica]");
      if (u) { alimentarCon(+u.dataset.unica); return; }
      const ver = ev.target.closest("[data-ver]");
      if (ver) { ev.preventDefault(); seleccionar(+ver.dataset.ver); }
    });
    $("balance").addEventListener("click", ev => {
      const ver = ev.target.closest("[data-ver]");
      if (ver) { ev.preventDefault(); seleccionar(+ver.dataset.ver); }
    });
    $("tabla").addEventListener("click", ev => {
      const th = ev.target.closest("th[data-col]");
      if (th && th.dataset.col !== "plan") {
        orden = { col: th.dataset.col, dir: orden.col === th.dataset.col ? -orden.dir : 1 };
        return render();
      }
      const ver = ev.target.closest("[data-ver]");
      if (ver) {
        ev.preventDefault();
        const m = D.minas.find(x => x.id === +ver.dataset.ver);
        mapa.setView([m.lat, m.lon], Math.max(mapa.getZoom(), 11));
        mostrarRuta(m);
        if (marcadores[m.id]) marcadores[m.id].bindPopup(popup(m), { maxWidth: 340 }).openPopup();
        seleccionar(m.id);
      }
    });
    $("tabla").addEventListener("change", ev => {
      const el = ev.target;
      if (el.dataset.plan) { alternar(+el.dataset.plan); return; }
      if (el.dataset.modo) {
        const id = +el.dataset.modo;
        ov[id] = Object.assign(ov[id] || {}, { modo: el.value });
        if (id === selId) fichaCompleta();
        render(); return;
      }
      if (el.dataset.ov) {
        const id = +el.dataset.id, v = parseFloat(el.value);
        ov[id] = ov[id] || {};
        if (isFinite(v)) ov[id][el.dataset.ov] = v; else delete ov[id][el.dataset.ov];
        render();
      }
    });
    $("buscar").addEventListener("input", programar);
    $("solo-plan").addEventListener("change", render);
    document.addEventListener("click", ev => {
      const b = ev.target.closest(".popup button[data-plan]");
      if (b) { alternar(+b.dataset.plan); mapa.closePopup(); }
    });
  }
  function alternar(id) { plan.has(id) ? plan.delete(id) : plan.add(id); render(); }

  function exportarCSV() {
    const lista = D.minas.filter(m => pasaFiltro(m) || plan.has(m.id));
    const cab = ["en_plan", "faena", "empresa", "comuna", "region", "mena", "mineral", "estado", "tipos", "labores", "lat", "lon",
      "km_recto", "km_camino_cercano", "via_cercana", "km_por_camino", "enami_cercana", "km_enami", "modalidad", "t_mes", "ley_cu", "costo_mina_usd_t", "flete_usd_t", "margen_neto_usd_t", "ley_equilibrio"];
    const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const filas = lista.map(m => {
      const e = evaluar(m), via = m.via_cercana || {};
      return [plan.has(m.id) ? 1 : 0, m.nombre, m.empresa, m.comuna, m.region, MENAS[m.mena], m.mineral, ESTADOS[m.estado],
        m.tipos.map(t => TIPOS[t]).join(" / "), m.labores, m.lat, m.lon, m.km_recto, m.km_camino_cercano,
        [via.rol, via.nombre, via.carpeta].filter(Boolean).join(" · "), m.km_total, m.enami_cercana, m.km_enami,
        e.modo, e.t, e.ley, e.costoMinaT.toFixed(2), e.flete.toFixed(2), e.margenNeto.toFixed(2),
        String(leyEquilibrio(m, e.t, "margenNeto") ?? "")].map(q).join(";");
    });
    const blob = new Blob(["﻿" + cab.join(";") + "\n" + filas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `faenas_el_salado_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------- render ----------------
  function render() {
    const lista = D.minas.filter(m => pasaFiltro(m) || plan.has(m.id));
    dibujarRadios();
    dibujarMinas(lista);
    leyenda();
    const r = simular();
    r.leyEq = leyEquilibrioPlan(r);
    kpis(r);
    bandas(lista);
    balance(r);
    tabla(lista);
    candidatas();
    fichaCuerpo();
    const pb = $("ficha").querySelector("button[data-plan]");
    if (pb) { const en = plan.has(+pb.dataset.plan); pb.textContent = en ? "Quitar del plan" : "Agregar al plan"; pb.className = en ? "" : "primary"; }
    guardar();
  }

  function iniciar() {
    cargar();
    panel();
    enlazarPanel();
    iniciarMapa();
    enlazarTabla();
    enlazarFicha();
    enlazarGraficos();
    fichaCompleta();
    $("btn-autollenar").onclick = autollenar;
    $("btn-limpiar").onclick = () => { plan = new Set(); render(); };
    $("btn-csv").onclick = exportarCSV;
    $("btn-reset").onclick = () => { P = clonar(DEF); ov = {}; panel(); fichaCompleta(); render(); };
    $("nota").innerHTML = `Fuentes: ${esc(D.fuentes)}. Datos generados el ${esc(D.generado)}. ${fmt(D.minas.length)} faenas de Cu/Au/Ag
      (regiones II–IV) con ruta a la planta a menos de 350 km. La distancia "por camino" es la ruta más corta por la red MOP más el tramo en
      línea recta desde la faena hasta la red; la red MOP no incluye todas las huellas mineras, por lo que ese tramo puede ser mayor que el real.
      Leyes, producciones, recuperaciones y costos son supuestos editables, no datos medidos.`;
    render();
  }
  // index.html los carga desde Firebase tras el login; local.html, desde data/datos_salado.js
  // Los valores propios de la planta (arriendo, stock y pago de ripios) vienen con los datos protegidos, no en este código público.
  window.iniciarSimulador = datos => {
    D = datos;
    for (const [k, v] of Object.entries(D.parametros || {})) {
      if (v && typeof v === "object" && DEF[k] && typeof DEF[k] === "object") Object.assign(DEF[k], v); else if (k in DEF) DEF[k] = v;
    }
    iniciar();
  };
})();

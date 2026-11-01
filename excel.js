// ============================================================
// excel.js — exporta el plan del simulador a un libro Excel con FÓRMULAS:
// cada paso del cálculo de app.js (evaluar / simular) es una celda con su
// fórmula, los parámetros tienen nombre (Precio_Cu, Tipo_cambio, …) y el
// balance trae una columna con el valor del simulador para comparar.
// Si se cambia el motor de app.js, hay que replicar el cambio aquí.
// ============================================================
(function () {
  "use strict";

  const EXCELJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
  let cargando = null;
  function cargarExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!cargando) cargando = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = EXCELJS_URL;
      s.onload = () => ok(window.ExcelJS);
      s.onerror = () => { cargando = null; mal(new Error("No se pudo cargar la librería de Excel (sin conexión?)")); };
      document.head.appendChild(s);
    });
    return cargando;
  }

  // ---------------- estilos ----------------
  const C_INPUT = { argb: "FF1F4E9E" };                       // azul: dato editable
  const F_INPUT = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF5D6" } };
  const F_SECCION = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  const F_CABEZA = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F3E52" } };
  const F_TOTAL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEFF2" } };
  const NUM = { 0: "#,##0", 1: "#,##0.0", 2: "#,##0.00", 3: "#,##0.000", 4: "#,##0.0000" };

  const letra = n => { let s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ok = v => v !== undefined && v !== null && !(typeof v === "number" && !isFinite(v));
  function valor(formula, res) { return ok(res) ? { formula, result: res } : { formula }; }
  function cabecera(ws, fila, textos) {
    const row = ws.getRow(fila);
    textos.forEach((t, i) => {
      const c = row.getCell(i + 1);
      c.value = t; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = F_CABEZA;
      c.alignment = { vertical: "middle", wrapText: true };
    });
    row.height = 30;
  }
  function seccion(ws, fila, texto, ncol) {
    const row = ws.getRow(fila);
    for (let i = 1; i <= ncol; i++) row.getCell(i).fill = F_SECCION;
    row.getCell(1).value = texto;
    row.getCell(1).font = { bold: true };
  }
  function marcarInput(c) { c.font = { color: C_INPUT, bold: true }; c.fill = F_INPUT; }

  // ---------------- parámetros con nombre ----------------
  // [nombre en fórmulas, ruta en P, etiqueta, unidad, nota]
  const PARAMS = [
    ["Planta"],
    ["Capacidad", "capacidad", "Capacidad de la planta", "t/mes", "sin DIA: menos de 5.000 t/mes (umbral SEIA)"],
    ["Limite_sin_DIA", "limiteSinDIA", "Umbral sin DIA", "t/mes"],
    ["Acido_kg_t", "acidoKgT", "Consumo de ácido", "kg/t"],
    ["Acido_USD_t", "acidoUsdT", "Precio del ácido", "US$/t ácido"],
    ["Fe_t_por_tCu", "feTCu", "Chatarra de fierro", "t Fe / t Cu", "precipitación de cobre cemento"],
    ["Fe_USD_t", "feUsdT", "Precio de la chatarra", "US$/t Fe"],
    ["OpVar_USD_t", "opVarUsdT", "Otros costos variables de planta", "US$/t", "energía, agua, mano de obra variable"],
    ["Costos fijos de planta"],
    ["Fijo_personal", "fijos.personal", "Personal de operación", "US$/mes"],
    ["Fijo_supervision", "fijos.supervision", "Supervisión y administración", "US$/mes"],
    ["Fijo_laboratorio", "fijos.laboratorio", "Laboratorio químico", "US$/mes"],
    ["Fijo_mantencion", "fijos.mantencion", "Mantención fija", "US$/mes"],
    ["Fijo_energia", "fijos.energia", "Energía (cargo fijo y demanda)", "US$/mes"],
    ["Fijo_transporte", "fijos.transporte", "Transporte, camionetas y alimentación", "US$/mes"],
    ["Fijo_otros", "fijos.otros", "Seguros, permisos, seguridad, oficina", "US$/mes"],
    ["Arriendo_UF", "arriendoUF", "Arriendo de la planta", "UF/mes"],
    ["UF_CLP", "ufClp", "Valor de la UF", "CLP"],
    ["Producto y mercado"],
    ["Precio_Cu", "cuUsdLb", "Precio del cobre", "US$/lb"],
    ["Tipo_cambio", "tc", "Tipo de cambio", "CLP/US$"],
    ["Ley_prec", "leyPrec", "Ley del precipitado", "% Cu"],
    ["Pagable_prec", "pagablePrec", "Pagable del precipitado", "% del valor del Cu"],
    ["Flete_prec_USD_t", "fletePrecUsdT", "Flete del precipitado", "US$/t precipitado"],
    ["Explotación propia y camiones"],
    ["Regalia_pct", "regaliaPct", "Regalía al dueño de la mina", "% del valor del Cu contenido"],
    ["Meses_amort", "mesesAmort", "Amortización de exploración y habilitación", "meses"],
    ["Camion_t", "camionT", "Capacidad del camión", "t"],
    ["Vel_km_h", "velKmH", "Velocidad media", "km/h"],
    ["Horas_carga", "horasCarga", "Carga, pesaje y descarga", "h/viaje"],
    ["Horas_dia", "horasDia", "Horas de operación", "h/día"],
    ["Dias_mes", "diasMes", "Días de operación", "días/mes"],
    ["Compra de mineral y flete"],
    ["Pago_minero_pct", "pagoPct", "Pago al minero (compra)", "% del valor del Cu contenido"],
    ["Flete_paga", "fletePaga", "Quién paga el flete en compra", "planta / minero", "en explotación propia siempre lo paga la planta"],
    ["Flete_CLP_tkm", "fleteClpTkm", "Tarifa de flete", "CLP/t·km"],
    ["Recargo_acceso", "recargoAcceso", "Recargo del tramo fuera de la red MOP", "× tarifa"],
    ["Carguio_USD_t", "cargaUsdT", "Carguío y pesaje", "US$/t"],
    ["Ripios en la planta"],
    ["Ripios_stock", "ripiosStock", "Stock de ripios", "t"],
    ["Ripios_t_mes", "ripiosTmes", "Alimentación de ripios", "t/mes"],
    ["Ripios_ley", "ripiosLey", "Ley de los ripios", "% Cu", "supuesto"],
    ["Ripios_rec", "ripiosRec", "Recuperación de los ripios", "%"],
    ["Ripios_pago", "ripiosCosto", "Pago al dueño de los ripios", "US$/t"],
    ["Ripios_manejo", "ripiosManejo", "Carguío y manejo de ripios", "US$/t"],
  ];
  // parámetros derivados (fórmulas)
  const DERIVADOS = [
    ["LB_por_t", "2204.62262", "Libras por tonelada", "lb/t", "constante"],
    ["Tarifa_USD_tkm", "Flete_CLP_tkm/Tipo_cambio", "Tarifa de flete en dólares", "US$/t·km", "Flete_CLP_tkm / Tipo_cambio"],
    ["Fijos_dotacion", "Fijo_personal+Fijo_supervision+Fijo_laboratorio+Fijo_mantencion+Fijo_energia+Fijo_transporte+Fijo_otros",
      "Costos fijos de dotación y servicios", "US$/mes", "suma de los 7 costos fijos"],
    ["Arriendo_USD_mes", "IF(Tipo_cambio>0,Arriendo_UF*UF_CLP/Tipo_cambio,0)", "Arriendo de la planta", "US$/mes", "Arriendo_UF × UF_CLP / Tipo_cambio"],
    ["Fijos_planta_mes", "Fijos_dotacion+Arriendo_USD_mes", "Costo fijo total de planta", "US$/mes", "dotación + arriendo"],
    ["Fijo_planta_t", "IF(Capacidad>0,Fijos_planta_mes/Capacidad,0)", "Costo fijo de planta por tonelada a capacidad", "US$/t",
      "se usa para el margen neto de cada faena"],
  ];
  const ruta = (P, r) => r.split(".").reduce((o, k) => o == null ? o : o[k], P);

  function hojaParametros(wb, ctx) {
    const { P, MENAS, TIPOS, LB_T } = ctx;
    const ws = wb.addWorksheet("Parámetros", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [{ width: 44 }, { width: 14 }, { width: 26 }, { width: 22 }, { width: 52 }];
    cabecera(ws, 1, ["Parámetro", "Valor", "Unidad", "Nombre en las fórmulas", "Nota"]);
    let f = 2;
    const nombre = (n, fila) => wb.definedNames.add(`'Parámetros'!$B$${fila}`, n);
    for (const p of PARAMS) {
      if (p.length === 1) { f++; seccion(ws, f++, p[0], 5); continue; }
      const [n, r, et, u, nota] = p;
      const row = ws.getRow(f);
      row.getCell(1).value = et;
      const c = row.getCell(2); c.value = ruta(P, r); marcarInput(c);
      if (typeof c.value === "number") c.numFmt = Math.abs(c.value) < 10 && c.value % 1 ? NUM[2] : NUM[0];
      row.getCell(3).value = u; row.getCell(4).value = n; row.getCell(5).value = nota || "";
      if (n === "Flete_paga") c.dataValidation = { type: "list", allowBlank: false, formulae: ['"planta,minero"'] };
      nombre(n, f); f++;
    }
    f++; seccion(ws, f++, "Calculados a partir de los anteriores (no editar)", 5);
    const resDer = {
      LB_por_t: LB_T, Tarifa_USD_tkm: P.fleteClpTkm / P.tc,
      Fijos_dotacion: Object.values(P.fijos).reduce((a, b) => a + b, 0),
      Arriendo_USD_mes: P.tc ? P.arriendoUF * P.ufClp / P.tc : 0,
    };
    resDer.Fijos_planta_mes = resDer.Fijos_dotacion + resDer.Arriendo_USD_mes;
    resDer.Fijo_planta_t = P.capacidad > 0 ? resDer.Fijos_planta_mes / P.capacidad : 0;
    for (const [n, fx, et, u, nota] of DERIVADOS) {
      const row = ws.getRow(f);
      row.getCell(1).value = et;
      row.getCell(2).value = n === "LB_por_t" ? LB_T : valor(fx, resDer[n]);
      row.getCell(2).numFmt = n === "Tarifa_USD_tkm" ? NUM[4] : NUM[2];
      row.getCell(3).value = u; row.getCell(4).value = n; row.getCell(5).value = nota;
      nombre(n, f); f++;
    }

    // tabla por tipo de mena
    f += 2; seccion(ws, f++, "Por tipo de mena (Tabla_menas)", 5);
    cabecera(ws, f++, ["Mena", "Recuperación %", "Ley por defecto % Cu", "", ""]);
    const m0 = f;
    for (const k of Object.keys(MENAS)) {
      const row = ws.getRow(f++);
      row.getCell(1).value = MENAS[k];
      [[2, P.rec[k]], [3, P.ley[k]]].forEach(([i, v]) => { const c = row.getCell(i); c.value = v; marcarInput(c); c.numFmt = NUM[2]; });
    }
    wb.definedNames.add(`'Parámetros'!$A$${m0}:$C$${f - 1}`, "Tabla_menas");
    wb.definedNames.add(`'Parámetros'!$A$${m0}:$A$${f - 1}`, "Lista_menas");
    ws.getRow(f++).getCell(1).value = `La ley por defecto solo se usa al agregar una faena en el simulador; en la hoja Minas la ley es un dato de cada faena. Tope para baja ley / desmonte: ${P.leyBajaLey} % Cu.`;

    // tabla por tipo de faena
    f += 1; seccion(ws, f++, "Por tipo de faena (Tabla_tipos) — explotación propia", 6);
    cabecera(ws, f++, ["Tipo de faena", "t/mes por defecto", "Costo fijo US$/mes por módulo", "Costo variable US$/t", "Capacidad por módulo t/mes", "Exploración y habilitación US$ por módulo"]);
    ws.getColumn(6).width = 22;
    const t0 = f;
    for (const k of Object.keys(TIPOS)) {
      const row = ws.getRow(f++), c = P.mina[k];
      row.getCell(1).value = TIPOS[k];
      [[2, P.tmes[k]], [3, c.fijo], [4, c.var], [5, c.cap], [6, c.explo]].forEach(([i, v]) => {
        const cel = row.getCell(i); cel.value = v; marcarInput(cel); cel.numFmt = v % 1 ? NUM[2] : NUM[0];
      });
    }
    wb.definedNames.add(`'Parámetros'!$A$${t0}:$F$${f - 1}`, "Tabla_tipos");
    wb.definedNames.add(`'Parámetros'!$A$${t0}:$A$${f - 1}`, "Lista_tipos");
  }

  // ---------------- hoja Minas: una columna por faena, una fila por paso ----------------
  // f: fórmula con {clave} = celda de la misma columna en la fila de esa clave; nombres de Parámetros tal cual.
  // v: valor que calculó el simulador (queda como resultado guardado; Excel recalcula al abrir).
  function filasMinas(ctx) {
    const { P, MENAS, TIPOS, ESTADOS } = ctx;
    const propia = x => x.e.modo === "propia";
    return [
      { sec: "Datos de la faena (las celdas amarillas se pueden cambiar)" },
      { k: "nombre", l: "Faena", in: x => x.m.nombre, txt: true },
      { k: "empresa", l: "Empresa (catastro)", in: x => x.m.empresa || "", txt: true, gris: true },
      { k: "comuna", l: "Comuna", in: x => x.m.comuna || "", txt: true, gris: true },
      { k: "estado", l: "Estado (catastro)", in: x => ESTADOS[x.m.estado] || x.m.estado, txt: true, gris: true },
      { k: "mena", l: "Tipo de mena", in: x => MENAS[x.m.mena], txt: true, lista: "Lista_menas", d: "define la recuperación (Tabla_menas)" },
      { k: "tipo", l: "Tipo de faena", in: x => TIPOS[x.tipo], txt: true, lista: "Lista_tipos", d: "define los costos de mina propia (Tabla_tipos)" },
      { k: "modo", l: "Modalidad", in: x => propia(x) ? "Propia" : "Compra", txt: true, lista: '"Propia,Compra"', d: "Propia = Goldberg arrienda y opera; Compra = se compra al minero" },
      { k: "km", l: "Distancia por camino a la planta", u: "km", in: x => x.m.km_total, n: 1, d: "ruta MOP + tramo faena → red" },
      { k: "kmEng", l: "Tramo faena → red MOP", u: "km", in: x => x.m.km_enganche, n: 2, d: "en línea recta, sin camino catastrado" },
      { k: "t", l: "Producción en el plan", u: "t/mes", in: x => x.e.t, n: 0 },
      { k: "ley", l: "Ley de cobre", u: "% Cu", in: x => x.e.ley, n: 2, d: "supuesto, no medido" },

      { sec: "1. Cobre y valor por tonelada de mineral" },
      { k: "rec", l: "Recuperación en planta", u: "%", f: "VLOOKUP({mena},Tabla_menas,2,FALSE)", v: x => P.rec[x.m.mena], n: 1, d: "según la mena, de Tabla_menas" },
      { k: "cuCont", l: "Cu contenido", u: "lb/t", f: "{ley}/100*LB_por_t", v: x => x.e.cuContLb, n: 2, d: "ley / 100 × 2.204,62 lb/t" },
      { k: "cuRec", l: "Cu recuperado", u: "lb/t", f: "{cuCont}*{rec}/100", v: x => x.e.cuRecLb, n: 2, d: "Cu contenido × recuperación" },
      { k: "ingreso", l: "Ingreso por el precipitado", u: "US$/t", f: "{cuRec}*Precio_Cu*Pagable_prec/100", v: x => x.e.ingreso, n: 2, d: "Cu recuperado × precio × pagable", neg: true },

      { sec: "2. Costo de proceso en planta" },
      { k: "acido", l: "Ácido sulfúrico", u: "US$/t", f: "Acido_kg_t*Acido_USD_t/1000", v: x => x.e.acido, n: 2, d: "kg/t × US$/t ácido / 1000" },
      { k: "chatarra", l: "Chatarra de fierro", u: "US$/t", f: "{cuRec}/LB_por_t*Fe_t_por_tCu*Fe_USD_t", v: x => x.e.chatarra, n: 2, d: "t Cu recuperado × t Fe/t Cu × precio" },
      { k: "opVar", l: "Otros variables", u: "US$/t", f: "OpVar_USD_t", v: x => x.e.opVar, n: 2 },
      { k: "fletePrec", l: "Flete del precipitado", u: "US$/t", f: "{cuRec}/LB_por_t/(Ley_prec/100)*Flete_prec_USD_t", v: x => x.e.fletePrec, n: 2, d: "t precipitado por t de mineral × flete" },
      { k: "proceso", l: "Costo de proceso", u: "US$/t", f: "{acido}+{chatarra}+{opVar}+{fletePrec}", v: x => x.e.proceso, n: 2, total: true },

      { sec: "3. Flete del mineral y camiones" },
      { k: "kmAcc", l: "Km fuera de la red (con recargo)", u: "km", f: "MIN({kmEng},{km})", v: x => x.e.kmAcc, n: 2 },
      { k: "kmRed", l: "Km por la red MOP", u: "km", f: "MAX({km}-{kmAcc},0)", v: x => x.e.kmRed, n: 2 },
      { k: "fleteRed", l: "Flete por la red", u: "US$/t", f: "{kmRed}*Tarifa_USD_tkm", v: x => x.e.fleteRed, n: 2, d: "km × tarifa" },
      { k: "fleteAcc", l: "Flete fuera de la red", u: "US$/t", f: "{kmAcc}*Recargo_acceso*Tarifa_USD_tkm", v: x => x.e.fleteAcc, n: 2, d: "km × recargo × tarifa" },
      { k: "carga", l: "Carguío y pesaje", u: "US$/t", f: "Carguio_USD_t", v: x => x.e.carga, n: 2 },
      { k: "flete", l: "Flete total del mineral", u: "US$/t", f: "{fleteRed}+{fleteAcc}+{carga}", v: x => x.e.flete, n: 2, total: true },
      { k: "fletePlanta", l: "Flete que paga la planta", u: "US$/t", f: 'IF(OR({modo}="Propia",Flete_paga="planta"),{flete},0)', v: x => x.e.fletePlanta, n: 2, d: "en compra, si lo paga el minero, la planta no lo paga" },
      { k: "viajes", l: "Viajes de camión", u: "viajes/mes", f: "{t}/Camion_t", v: x => x.e.viajes, n: 1 },
      { k: "ciclo", l: "Ciclo por viaje", u: "h", f: "2*{km}/Vel_km_h+Horas_carga", v: x => x.e.cicloH, n: 2, d: "ida y vuelta + carga" },
      { k: "camiones", l: "Camiones requeridos", u: "camiones", f: "{viajes}*{ciclo}/(Horas_dia*Dias_mes)", v: x => x.e.camiones, n: 2, d: "horas de camión / horas disponibles por camión" },

      { sec: "4. Costo de mina (explotación propia) o compra de mineral" },
      { k: "valorCont", l: "Valor del Cu contenido", u: "US$/t", f: "{cuCont}*Precio_Cu", v: x => x.e.cuContLb * P.cuUsdLb, n: 2, d: "base de la regalía y del pago al minero" },
      { k: "cap", l: "Capacidad por módulo", u: "t/mes", f: 'IF({modo}="Propia",VLOOKUP({tipo},Tabla_tipos,5,FALSE),"")', v: x => propia(x) ? x.e.cap : "", n: 0, d: "Tabla_tipos" },
      { k: "modulos", l: "Módulos de mina", u: "módulos", f: 'IF({modo}="Propia",MAX(1,ROUNDUP({t}/{cap},0)),0)', v: x => x.e.modulos || 0, n: 0, d: "t/mes / capacidad por módulo, hacia arriba" },
      { k: "minaFijo", l: "Costo fijo de mina", u: "US$/mes", f: 'IF({modo}="Propia",VLOOKUP({tipo},Tabla_tipos,3,FALSE)*{modulos},0)', v: x => x.e.minaFijoMes, n: 0, d: "costo fijo por módulo × módulos" },
      { k: "explo", l: "Exploración y habilitación amortizada", u: "US$/mes", f: 'IF(AND({modo}="Propia",Meses_amort>0),VLOOKUP({tipo},Tabla_tipos,6,FALSE)*{modulos}/Meses_amort,0)', v: x => x.e.exploMes, n: 0, d: "inversión × módulos / meses de amortización" },
      { k: "fijoMina", l: "Fijo total de mina", u: "US$/mes", f: "{minaFijo}+{explo}", v: x => x.e.fijoMinaMes, n: 0, total: true },
      { k: "minaVar", l: "Costo variable de mina", u: "US$/t", f: 'IF({modo}="Propia",VLOOKUP({tipo},Tabla_tipos,4,FALSE),0)', v: x => x.e.minaVar, n: 2, d: "Tabla_tipos" },
      { k: "regalia", l: "Regalía al dueño", u: "US$/t", f: 'IF({modo}="Propia",{valorCont}*Regalia_pct/100,0)', v: x => x.e.regalia, n: 2 },
      { k: "compra", l: "Pago al minero (compra)", u: "US$/t", f: 'IF({modo}="Propia",0,{valorCont}*Pago_minero_pct/100)', v: x => x.e.compra, n: 2 },
      { k: "costoMinaT", l: "Costo de mina o compra", u: "US$/t", f: "IF({t}>0,{fijoMina}/{t}+{minaVar}+{regalia}+{compra},0)", v: x => x.e.costoMinaT, n: 2, total: true, d: "fijo / t + variable + regalía + compra" },
      { k: "netoMinero", l: "Lo que recibe el minero", u: "US$/t", f: 'IF(AND({modo}="Compra",Flete_paga="minero"),{compra}-{flete},{compra})', v: x => x.e.netoMinero, n: 2, d: "solo en compra" },

      { sec: "5. Margen de la faena" },
      { k: "contrib", l: "Contribución variable", u: "US$/t", f: "{ingreso}-{proceso}-{fletePlanta}-{compra}-{minaVar}-{regalia}", v: x => x.e.contribT, n: 2, d: "ingreso − proceso − flete − compra − variable mina − regalía", neg: true },
      { k: "margenMes", l: "Margen de la faena", u: "US$/mes", f: "{contrib}*{t}-{fijoMina}", v: x => x.e.margenMes, n: 0, d: "contribución × t − fijo de mina", neg: true },
      { k: "margen", l: "Margen antes de fijos de planta", u: "US$/t", f: "IF({t}>0,{margenMes}/{t},-{fijoMina})", v: x => x.e.margen, n: 2, neg: true, total: true },
      { k: "fijoPlantaT", l: "Fijos de planta prorrateados", u: "US$/t", f: "Fijo_planta_t", v: x => x.e.margen - x.e.margenNeto, n: 2, d: "fijos de planta / capacidad" },
      { k: "margenNeto", l: "Margen neto", u: "US$/t", f: "{margen}-{fijoPlantaT}", v: x => x.e.margenNeto, n: 2, neg: true, total: true },
      { k: "propLey", l: "Parte del margen que sube con la ley", u: "US$/t", f: "{ingreso}-{chatarra}-{fletePrec}-{regalia}-{compra}", v: x => x.e.ingreso - x.e.chatarra - x.e.fletePrec - x.e.regalia - x.e.compra, n: 2, d: "el margen es lineal en la ley" },
      { k: "leyEq", l: "Ley de equilibrio (margen neto = 0)", u: "% Cu", f: 'IF({propLey}>0,MAX({ley}*(1-{margenNeto}/{propLey}),0),"")', v: x => x.leq, n: 2, total: true, d: "ley × (1 − margen neto / parte proporcional)" },

      { sec: "6. Aporte al balance mensual de la planta" },
      { k: "tProc", l: "Toneladas procesadas", u: "t/mes", f: "{t}*Factor_capacidad", v: x => x.e.t * ctx.r.factor, n: 0, d: "t del plan × factor de capacidad (hoja Balance)" },
      { k: "cuContMes", l: "Cu contenido", u: "lb/mes", f: "{cuCont}*{tProc}", n: 0 },
      { k: "cuRecMes", l: "Cu recuperado", u: "lb/mes", f: "{cuRec}*{tProc}", n: 0 },
      { k: "ingresoMes", l: "Ingreso", u: "US$/mes", f: "{ingreso}*{tProc}", n: 0 },
      { k: "acidoMes", l: "Ácido", u: "US$/mes", f: "{acido}*{tProc}", n: 0 },
      { k: "chatarraMes", l: "Chatarra", u: "US$/mes", f: "{chatarra}*{tProc}", n: 0 },
      { k: "opVarMes", l: "Otros variables", u: "US$/mes", f: "{opVar}*{tProc}", n: 0 },
      { k: "fletePrecMes", l: "Flete del precipitado", u: "US$/mes", f: "{fletePrec}*{tProc}", n: 0 },
      { k: "fleteMes", l: "Flete del mineral (planta)", u: "US$/mes", f: "{fletePlanta}*{tProc}", n: 0 },
      { k: "compraMes", l: "Compra de mineral", u: "US$/mes", f: "{compra}*{tProc}", n: 0 },
      { k: "minaVarMes", l: "Costo variable de mina", u: "US$/mes", f: "{minaVar}*{tProc}", n: 0 },
      { k: "regaliaMes", l: "Regalía", u: "US$/mes", f: "{regalia}*{tProc}", n: 0 },
      { k: "minaFijoMes", l: "Costo fijo de mina", u: "US$/mes", f: "{minaFijo}", n: 0, d: "no se escala con el factor de capacidad" },
      { k: "exploMes", l: "Exploración amortizada", u: "US$/mes", f: "{explo}", n: 0 },
      { k: "camionesPlan", l: "Camiones en el plan", u: "camiones", f: "{camiones}*Factor_capacidad", n: 2 },
    ];
  }
  // valores guardados para el paso 6 (por tonelada × t procesadas)
  const POR_T = { cuContMes: "cuContLb", cuRecMes: "cuRecLb", ingresoMes: "ingreso", acidoMes: "acido", chatarraMes: "chatarra",
    opVarMes: "opVar", fletePrecMes: "fletePrec", fleteMes: "fletePlanta", compraMes: "compra", minaVarMes: "minaVar", regaliaMes: "regalia" };

  function hojaMinas(wb, ctx) {
    const ws = wb.addWorksheet("Minas", { views: [{ state: "frozen", xSplit: 3, ySplit: 2 }] });
    const filas = filasMinas(ctx);
    const C0 = 5, n = ctx.filas.length;
    ws.getColumn(1).width = 4; ws.getColumn(2).width = 40; ws.getColumn(3).width = 12; ws.getColumn(4).width = 46;
    for (let i = 0; i < Math.max(n, 1); i++) ws.getColumn(C0 + i).width = 18;
    cabecera(ws, 1, ["", "Paso", "Unidad", "Cómo se calcula", ...(n ? ctx.filas.map((x, i) => `Faena ${i + 1}`) : ["(plan vacío)"])]);
    ws.mergeCells(2, 1, 2, 4 + Math.max(n, 1));
    ws.getRow(2).getCell(1).value = "Una columna por faena del plan. Celdas amarillas con texto azul = datos (se pueden cambiar); el resto son fórmulas. Los parámetros generales están en la hoja Parámetros.";
    ws.getRow(2).getCell(1).font = { italic: true, color: { argb: "FF5B6573" } };

    // primera pasada: numerar filas (cada sección deja una fila en blanco antes), así las fórmulas pueden apuntar hacia abajo
    const filaDe = {};
    let f = 1;
    filas.forEach(d => { if (d.sec) { f += 2; d._fila = f; } else filaDe[d.k] = ++f; });
    filas.forEach(d => {
      if (d.sec) { seccion(ws, d._fila, d.sec, 4 + Math.max(n, 1)); return; }
      const row = ws.getRow(filaDe[d.k]);
      row.getCell(2).value = d.l; row.getCell(3).value = d.u || ""; row.getCell(4).value = d.d || "";
      row.getCell(4).font = { color: { argb: "FF5B6573" } };
      if (d.total) [2, 3].forEach(i => { row.getCell(i).font = { bold: true }; });
      ctx.filas.forEach((x, i) => {
        const col = letra(C0 + i), c = row.getCell(C0 + i);
        if (d.in) {
          c.value = d.in(x);
          if (d.gris) c.font = { color: { argb: "FF5B6573" } }; else marcarInput(c);
          if (d.lista) c.dataValidation = { type: "list", allowBlank: false, formulae: [d.lista] };
          if (d.k === "nombre") { c.font = { bold: true, color: C_INPUT }; c.alignment = { wrapText: true }; }
        } else {
          const fx = d.f.replace(/\{(\w+)\}/g, (_, k) => {
            if (!filaDe[k]) throw new Error("Fila desconocida en fórmula: " + k);
            return col + filaDe[k];
          });
          let res = d.v ? d.v(x) : (POR_T[d.k] ? x.e[POR_T[d.k]] * x.e.t * ctx.r.factor : undefined);
          if (d.k === "minaFijoMes") res = x.e.minaFijoMes;
          if (d.k === "exploMes") res = x.e.exploMes;
          if (d.k === "camionesPlan") res = x.e.camiones * ctx.r.factor;
          c.value = valor(fx, res);
          if (d.total) c.font = { bold: true }; else c.font = {};
          if (d.total) c.fill = F_TOTAL;
        }
        if (!d.txt) c.numFmt = d.neg ? `${NUM[d.n || 0]};[Red]-${NUM[d.n || 0]}` : NUM[d.n || 0];
      });
    });
    return { filaDe, ultima: n ? letra(C0 + n - 1) : null, primera: letra(C0) };
  }

  // ---------------- hoja Balance ----------------
  function hojaBalance(wb, ctx, M) {
    const { r, P } = ctx;
    const ws = wb.addWorksheet("Balance", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [{ width: 42 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 11 }, { width: 11 }, { width: 60 }];
    cabecera(ws, 1, ["Concepto", "Valor (fórmula)", "Unidad", "Valor en el simulador", "Diferencia", "US$/t alim.", "US$/lb Cu", "Cómo se calcula"]);
    const sumaMinas = k => M.ultima ? `SUM(Minas!$${M.primera}$${M.filaDe[k]}:$${M.ultima}$${M.filaDe[k]})` : "0";
    const ER = ctx.ripios;      // economía por tonelada de los ripios, calculada por el simulador
    const costoKeys = ["minaFijo", "explo", "minaVar", "regalia", "compra", "flete", "ripios", "acido", "chatarra", "opVar", "fletePrec", "arriendo", "fijo"];
    const filas = [
      { sec: "1. Alimentación de la planta" },
      { k: "cap", l: "Capacidad", u: "t/mes", f: "Capacidad", v: P.capacidad },
      { k: "ripT", l: "Ripios procesados", u: "t/mes", f: "MIN(Ripios_t_mes,Capacidad,Ripios_stock)", v: r.ripT, d: "lo menor entre alimentación, capacidad y stock" },
      { k: "tMinas", l: "Toneladas de las faenas del plan", u: "t/mes", f: `${sumaMinas("t")}`, v: r.tMinas, d: "suma de la fila 'Producción en el plan' (hoja Minas)" },
      { k: "disp", l: "Capacidad disponible para faenas", u: "t/mes", f: "MAX({cap}-{ripT},0)", v: Math.max(P.capacidad - r.ripT, 0) },
      { k: "factor", l: "Factor de capacidad", u: "×", f: "IF(AND({tMinas}>{disp},{tMinas}>0),{disp}/{tMinas},1)", v: r.factor, n: 4, nombre: "Factor_capacidad",
        d: "si las faenas superan la capacidad, se procesa esta fracción de cada una" },
      { k: "tProc", l: "Toneladas de faenas procesadas", u: "t/mes", f: "{tMinas}*{factor}", v: r.tMinas * r.factor },
      { k: "tTotal", l: "Alimentación total", u: "t/mes", f: "{ripT}+{tProc}", v: r.tTotal, total: true },
      { k: "libre", l: "Capacidad libre", u: "t/mes", f: "MAX({cap}-{tTotal},0)", v: Math.max(P.capacidad - r.tTotal, 0) },
      { k: "uso", l: "Uso de capacidad", u: "%", f: "IF({cap}>0,{tTotal}/{cap}*100,0)", v: P.capacidad ? r.tTotal / P.capacidad * 100 : 0, n: 1 },
      { k: "dia", l: "Permiso ambiental", u: "", f: 'IF(Capacidad>=Limite_sin_DIA,"Requiere DIA: la planta no tiene","Bajo el umbral: sin DIA")',
        v: P.capacidad >= P.limiteSinDIA ? "Requiere DIA: la planta no tiene" : "Bajo el umbral: sin DIA", txt: true },

      { sec: "2. Ripios (por tonelada; mismo cálculo que las faenas, pasos 1 y 2)" },
      { k: "rCuCont", l: "Cu contenido", u: "lb/t", f: "Ripios_ley/100*LB_por_t", v: ER.cuContLb, n: 2 },
      { k: "rCuRec", l: "Cu recuperado", u: "lb/t", f: "{rCuCont}*Ripios_rec/100", v: ER.cuRecLb, n: 2 },
      { k: "rIngreso", l: "Ingreso", u: "US$/t", f: "{rCuRec}*Precio_Cu*Pagable_prec/100", v: ER.ingreso, n: 2 },
      { k: "rAcido", l: "Ácido", u: "US$/t", f: "Acido_kg_t*Acido_USD_t/1000", v: ER.acido, n: 2 },
      { k: "rChatarra", l: "Chatarra", u: "US$/t", f: "{rCuRec}/LB_por_t*Fe_t_por_tCu*Fe_USD_t", v: ER.chatarra, n: 2 },
      { k: "rOpVar", l: "Otros variables", u: "US$/t", f: "OpVar_USD_t", v: ER.opVar, n: 2 },
      { k: "rFletePrec", l: "Flete del precipitado", u: "US$/t", f: "{rCuRec}/LB_por_t/(Ley_prec/100)*Flete_prec_USD_t", v: ER.fletePrec, n: 2 },
      { k: "rCosto", l: "Pago + manejo de ripios", u: "US$/t", f: "Ripios_pago+Ripios_manejo", v: P.ripiosCosto + P.ripiosManejo, n: 2 },

      { sec: "3. Balance mensual (las columnas F y G dividen por las t de alimentación y por las lb de Cu recuperado)" },
      { k: "ingreso", l: "Ingresos por precipitado", u: "US$/mes", f: `${sumaMinas("ingresoMes")}+{rIngreso}*{ripT}`, v: r.ingreso, total: true, por: true, d: "faenas (hoja Minas, paso 6) + ripios" },
      { k: "minaFijo", l: "Mina: costos fijos (faenas propias)", u: "US$/mes", f: sumaMinas("minaFijoMes"), v: r.minaFijo, por: true },
      { k: "explo", l: "Mina: exploración y habilitación", u: "US$/mes", f: sumaMinas("exploMes"), v: r.explo, por: true },
      { k: "minaVar", l: "Mina: costo variable", u: "US$/mes", f: sumaMinas("minaVarMes"), v: r.minaVar, por: true },
      { k: "regalia", l: "Regalías a dueños de minas", u: "US$/mes", f: sumaMinas("regaliaMes"), v: r.regalia, por: true },
      { k: "compra", l: "Compra de mineral a terceros", u: "US$/mes", f: sumaMinas("compraMes"), v: r.compra, por: true },
      { k: "flete", l: "Flete de mineral", u: "US$/mes", f: sumaMinas("fleteMes"), v: r.flete, por: true },
      { k: "ripios", l: "Ripios (pago + manejo)", u: "US$/mes", f: "{rCosto}*{ripT}", v: r.ripios, por: true },
      { k: "acido", l: "Ácido sulfúrico", u: "US$/mes", f: `${sumaMinas("acidoMes")}+{rAcido}*{ripT}`, v: r.acido, por: true },
      { k: "chatarra", l: "Chatarra de fierro", u: "US$/mes", f: `${sumaMinas("chatarraMes")}+{rChatarra}*{ripT}`, v: r.chatarra, por: true },
      { k: "opVar", l: "Otros variables", u: "US$/mes", f: `${sumaMinas("opVarMes")}+{rOpVar}*{ripT}`, v: r.opVar, por: true },
      { k: "fletePrec", l: "Flete del precipitado", u: "US$/mes", f: `${sumaMinas("fletePrecMes")}+{rFletePrec}*{ripT}`, v: r.fletePrec, por: true },
      { k: "arriendo", l: "Arriendo de la planta", u: "US$/mes", f: "Arriendo_USD_mes", v: r.arriendo, por: true },
      { k: "fijo", l: "Costos fijos (dotación y servicios)", u: "US$/mes", f: "Fijos_dotacion", v: r.fijo, por: true },
      { k: "costos", l: "Costo total", u: "US$/mes", f: costoKeys.map(k => `{${k}}`).join("+"), v: r.costos, total: true, por: true },
      { k: "ebitda", l: "EBITDA", u: "US$/mes", f: "{ingreso}-{costos}", v: r.ebitda, total: true, por: true, neg: true },
      { k: "ebitdaAnual", l: "EBITDA anual", u: "US$/año", f: "{ebitda}*12", v: r.ebitda * 12, neg: true },

      { sec: "4. Indicadores" },
      { k: "cuContLb", l: "Cu contenido en la alimentación", u: "lb/mes", f: `${sumaMinas("cuContMes")}+{rCuCont}*{ripT}`, v: r.cuCont },
      { k: "cuRecLb", l: "Cu recuperado", u: "lb/mes", f: `${sumaMinas("cuRecMes")}+{rCuRec}*{ripT}`, v: r.cuRec },
      { k: "cuContT", l: "Cu contenido", u: "t/mes", f: "{cuContLb}/LB_por_t", v: r.cuCont / ctx.LB_T, n: 1 },
      { k: "leyMedia", l: "Ley media de alimentación", u: "% Cu", f: "IF({tTotal}>0,{cuContT}/{tTotal}*100,0)", v: r.leyMedia, n: 2, total: true },
      { k: "recGlobal", l: "Recuperación global", u: "%", f: "IF({cuContLb}>0,{cuRecLb}/{cuContLb}*100,0)", v: r.cuCont ? r.cuRec / r.cuCont * 100 : 0, n: 1 },
      { k: "cuFino", l: "Cu fino producido", u: "t/mes", f: "{cuRecLb}/LB_por_t", v: r.cuFinoT, n: 1 },
      { k: "prec", l: "Precipitado producido", u: "t/mes", f: "{cuFino}/(Ley_prec/100)", v: r.precT, n: 1 },
      { k: "costoLb", l: "Costo total por libra", u: "US$/lb", f: "IF({cuRecLb}>0,{costos}/{cuRecLb},0)", v: r.costoLb, n: 2, total: true, d: "comparar con Precio_Cu" },
      { k: "camiones", l: "Camiones requeridos", u: "camiones", f: sumaMinas("camionesPlan"), v: r.camiones, n: 1 },
      { k: "vida", l: "Vida de los ripios", u: "años", f: 'IF({ripT}>0,Ripios_stock/{ripT}/12,"")', v: r.vidaRipios != null ? r.vidaRipios / 12 : "", n: 1 },
      { k: "propLey", l: "Parte del EBITDA que sube con la ley", u: "US$/mes", f: "{ingreso}-{chatarra}-{fletePrec}-{regalia}-{compra}",
        v: r.ingreso - r.chatarra - r.fletePrec - r.regalia - r.compra, d: "ingreso menos los costos proporcionales al Cu" },
      { k: "leyEq", l: "Ley de equilibrio de la alimentación (EBITDA = 0)", u: "% Cu", f: 'IF({propLey}>0,MAX({leyMedia}*(1-{ebitda}/{propLey}),0),"")',
        v: r.leyEq == null ? "" : r.leyEq, n: 2, total: true, d: "todas las leyes escaladas en la misma proporción (el EBITDA es lineal en la ley)" },
    ];
    const filaDe = {};
    let f = 1;
    filas.forEach(d => { if (d.sec) f += 2; else filaDe[d.k] = ++f; });
    f = 1;
    filas.forEach(d => {
      if (d.sec) { f += 2; seccion(ws, f, d.sec, 8); return; }
      const fila = filaDe[d.k], row = ws.getRow(++f);
      const fx = d.f.replace(/\{(\w+)\}/g, (_, k) => { if (!filaDe[k]) throw new Error("Fila desconocida: " + k); return "B" + filaDe[k]; });
      const fmtN = d.neg ? `${NUM[d.n || 0]};[Red]-${NUM[d.n || 0]}` : NUM[d.n || 0];
      row.getCell(1).value = d.l;
      row.getCell(2).value = valor(fx, d.v);
      row.getCell(3).value = d.u;
      row.getCell(4).value = d.v === "" ? "" : d.v;
      row.getCell(5).value = d.txt ? valor(`IF(B${fila}=D${fila},"OK","distinto")`, "OK")
        : valor(`IF(ISNUMBER(D${fila}),B${fila}-D${fila},"")`, ok(d.v) && d.v !== "" ? 0 : "");
      row.getCell(8).value = d.d || (d.f.length < 90 ? "= " + d.f.replace(/\{(\w+)\}/g, (_, k) => (filas.find(x => x.k === k) || {}).l || k) : "");
      row.getCell(8).font = { color: { argb: "FF5B6573" } };
      [2, 4].forEach(i => { if (!d.txt) row.getCell(i).numFmt = fmtN; });
      row.getCell(5).numFmt = "0.000;[Red]-0.000";
      row.getCell(4).font = { color: { argb: "FF5B6573" } };
      if (d.por) {
        const t = filaDe.tTotal, lb = filaDe.cuRecLb;
        row.getCell(6).value = valor(`IF($B$${t}>0,B${fila}/$B$${t},0)`, r.tTotal ? d.v / r.tTotal : 0);
        row.getCell(7).value = valor(`IF($B$${lb}>0,B${fila}/$B$${lb},0)`, r.cuRec ? d.v / r.cuRec : 0);
        row.getCell(6).numFmt = "#,##0.0;[Red]-#,##0.0"; row.getCell(7).numFmt = "#,##0.00;[Red]-#,##0.00";
      }
      if (d.total) { [1, 2, 3].forEach(i => { row.getCell(i).font = { bold: true }; row.getCell(i).fill = F_TOTAL; }); }
      if (d.nombre) wb.definedNames.add(`Balance!$B$${fila}`, d.nombre);
    });
    return filaDe;
  }

  // ---------------- hoja Léame ----------------
  function hojaLeame(wb, ctx) {
    const ws = wb.addWorksheet("Léame");
    ws.getColumn(1).width = 110;
    const r = ctx.r;
    const lineas = [
      ["Simulador Planta El Salado (RioSal) — plan de abastecimiento con fórmulas", { bold: true, size: 14 }],
      [`Exportado el ${new Date().toLocaleString("es-CL")}. Datos del simulador generados el ${ctx.generado || "–"}.`, { color: { argb: "FF5B6573" } }],
      [""],
      [`Plan: ${ctx.filas.length} faena(s), ${Math.round(r.tTotal).toLocaleString("es-CL")} t/mes, ley media ${r.leyMedia.toFixed(2)} % Cu, EBITDA US$ ${Math.round(r.ebitda).toLocaleString("es-CL")}/mes.`, { bold: true }],
      [""],
      ["Cómo leer este libro", { bold: true }],
      ["1. Parámetros: todos los supuestos del simulador. Cada uno tiene un nombre (columna D) que se usa en las fórmulas, p. ej. Precio_Cu o Tipo_cambio."],
      ["2. Minas: una columna por faena del plan y una fila por paso — cobre y valor, proceso, flete y camiones, costo de mina o compra, margen y aporte al balance."],
      ["3. Balance: suma las faenas (y los ripios, si se usan), arma el balance mensual y los indicadores. La columna D trae el valor que calculó el simulador y la E la diferencia con la fórmula (debe ser 0)."],
      [""],
      ["Celdas amarillas con texto azul = datos que se pueden cambiar; todo lo demás son fórmulas. Al cambiar un dato, Excel recalcula el libro completo."],
      ["Ojo: al cambiar parámetros aquí, la columna 'Valor en el simulador' deja de coincidir (es una foto del momento de exportar)."],
      ["Cambiar la modalidad (Propia / Compra), la mena o el tipo de faena en la hoja Minas cambia los costos que se aplican a esa faena."],
      [""],
      ["Supuestos: leyes, producciones, recuperaciones y costos son supuestos editables, no datos medidos. Las distancias por camino salen de la red MOP más un tramo en línea recta hasta la faena."],
      ["Documento interno de Goldberg Resources: incluye valores contractuales de la planta."],
    ];
    lineas.forEach(([t, font], i) => {
      const c = ws.getRow(i + 1).getCell(1);
      c.value = t; if (font) c.font = font; c.alignment = { wrapText: true, vertical: "top" };
    });
  }

  window.exportarExcelSalado = async function (ctx) {
    const ExcelJS = await cargarExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = "Simulador Planta El Salado";
    wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;
    hojaLeame(wb, ctx);
    hojaParametros(wb, ctx);
    const M = hojaMinas(wb, ctx);
    hojaBalance(wb, ctx, M);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `plan_el_salado_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
})();

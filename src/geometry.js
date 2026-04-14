const NS = "http://www.w3.org/2000/svg";

export function generarCruceta(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const base = ((y % 100) + m + d) % 100;
  const rev = parseInt(String(base).padStart(2, "0").split("").reverse().join(""));
  const sum = (base + rev) % 100;
  const dif = Math.abs(base - rev);
  return {
    centro: base,
    norte: (base + sum) % 100,
    sur: (base + dif) % 100,
    este: rev,
    oeste: sum,
  };
}

export function generarTrianguloInvertido(fechaISO) {
  const digits = fechaISO
    .replaceAll("-", "")
    .split("")
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  const niveles = [];
  let nivel = digits;
  while (nivel.length > 1) {
    niveles.push(nivel);
    const next = [];
    for (let i = 0; i < nivel.length - 1; i++) {
      next.push((nivel[i] + nivel[i + 1]) % 10);
    }
    nivel = next;
  }
  if (nivel.length) niveles.push(nivel);
  return niveles;
}

export function generarCrucetaTurnos(numero11, numero3) {
  const tens11 = Math.floor(numero11 / 10) % 10;
  const ones11 = numero11 % 10;
  const tens3 = Math.floor(numero3 / 10) % 10;
  const ones3 = numero3 % 10;

  const steps = [];
  const sum = (a, b, label) => {
    const raw = a + b;
    const mod = ((raw % 10) + 10) % 10;
    steps.push({ label, expr: `${a} + ${b} = ${raw}`, result: mod });
    return mod;
  };

  const north = sum(tens11, ones11, "Norte (decena + unidad 11 AM)");
  const south = sum(tens3, ones3, "Sur (decena + unidad 3 PM)");
  const west = sum(tens11, tens3, "Oeste (decenas 11/3 PM)");
  const east = sum(ones11, ones3, "Este (unidades 11/3 PM)");
  const diagonalLeft = sum(north, south, "Diagonal izquierda (Norte + Sur)");
  const diagonalRight = sum(west, east, "Diagonal derecha (Oeste + Este)");
  const center = sum(diagonalLeft, diagonalRight, "Centro (diagonales)");

  const candidateNotes = [];
  const createCandidate = (label, tensDigit, onesDigit, origin) => {
    const value = (tensDigit * 10 + onesDigit) % 100;
    candidateNotes.push({
      label,
      detail: `${label}: ${tensDigit}${onesDigit} (${origin})`,
      value,
    });
    return value;
  };

  const candidates = Array.from(
    new Set(
      [
        createCandidate("Candidato A", north, south, "Norte / Sur"),
        createCandidate("Candidato B", west, east, "Oeste / Este"),
        createCandidate("Candidato C", diagonalLeft, diagonalRight, "Diagonales"),
        createCandidate("Candidato D", center, north, "Centro + Norte"),
        createCandidate("Candidato E", center, south, "Centro + Sur"),
      ]
        .filter((n) => Number.isFinite(n)),
    ),
  ).slice(0, 4);

  return {
    north,
    south,
    east,
    west,
    center,
    diagonalLeft,
    diagonalRight,
    candidates,
    steps,
    candidateNotes,
  };
}

export function dibujarTrianguloInvertido(container, niveles) {
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(niveles) || !niveles.length) {
    container.innerHTML = "<p class='hint'>Sin datos para construir el triángulo.</p>";
    return;
  }
  const rows = niveles.length;
  const maxCols = Math.max(...niveles.map((row) => row.length));
  if (!maxCols) {
    container.innerHTML = "<p class='hint'>No se pudieron calcular los niveles.</p>";
    return;
  }
  const colGap = 80;
  const rowGap = 70;
  const pad = 36;
  const width = pad * 2 + Math.max(0, (maxCols - 1) * colGap);
  const height = pad * 2 + Math.max(0, (rows - 1) * rowGap);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", height);
  svg.classList.add("triang-svg");

  const defs = document.createElementNS(NS, "defs");
  const gradient = document.createElementNS(NS, "linearGradient");
  gradient.setAttribute("id", "triGradient");
  gradient.setAttribute("x1", "0%");
  gradient.setAttribute("x2", "100%");
  gradient.innerHTML = `
    <stop offset="0%" stop-color="#f5d36b" stop-opacity="0.95" />
    <stop offset="100%" stop-color="#fb8c6b" stop-opacity="0.9" />
  `;
  defs.appendChild(gradient);
  const glow = document.createElementNS(NS, "filter");
  glow.setAttribute("id", "triGlow");
  glow.innerHTML = `
    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
    <feMerge>
      <feMergeNode in="coloredBlur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  `;
  defs.appendChild(glow);
  svg.appendChild(defs);

  const background = document.createElementNS(NS, "rect");
  background.setAttribute("x", 0);
  background.setAttribute("y", 0);
  background.setAttribute("width", width);
  background.setAttribute("height", height);
  background.setAttribute("rx", 16);
  background.setAttribute("fill", "rgba(7, 10, 18, 0.85)");
  background.setAttribute("stroke", "rgba(255, 255, 255, 0.08)");
  svg.appendChild(background);

  const positions = [];
  for (let r = 0; r < rows; r++) {
    const row = niveles[r];
    const rowLen = row.length;
    const rowWidth = (rowLen - 1) * colGap;
    const offsetX = pad + (width - 2 * pad - rowWidth) / 2;
    const y = pad + r * rowGap;
    positions[r] = [];
    for (let i = 0; i < rowLen; i++) {
      const x = offsetX + i * colGap;
      positions[r][i] = { x, y, value: row[i] };
    }
  }

  for (let r = 0; r < positions.length - 1; r++) {
    const currentRow = positions[r];
    const nextRow = positions[r + 1];
    for (let i = 0; i < currentRow.length; i++) {
      const point = currentRow[i];
      const leftTarget = nextRow[i];
      const rightTarget = nextRow[i + 1];
      if (leftTarget) {
        const line = document.createElementNS(NS, "line");
        line.setAttribute("x1", point.x);
        line.setAttribute("y1", point.y);
        line.setAttribute("x2", leftTarget.x);
        line.setAttribute("y2", leftTarget.y);
        line.setAttribute("stroke", "rgba(245, 211, 107, 0.25)");
        line.setAttribute("stroke-width", "2");
        svg.appendChild(line);
      }
      if (rightTarget) {
        const line = document.createElementNS(NS, "line");
        line.setAttribute("x1", point.x);
        line.setAttribute("y1", point.y);
        line.setAttribute("x2", rightTarget.x);
        line.setAttribute("y2", rightTarget.y);
        line.setAttribute("stroke", "rgba(254, 140, 107, 0.2)");
        line.setAttribute("stroke-width", "2");
        svg.appendChild(line);
      }
    }
  }

  positions.forEach((row, rowIdx) => {
    row.forEach((node) => {
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", node.x);
      circle.setAttribute("cy", node.y);
      circle.setAttribute("r", 22);
      circle.setAttribute("fill", "url(#triGradient)");
      circle.setAttribute("stroke", "rgba(255,255,255,0.3)");
      circle.setAttribute("stroke-width", "2");
      circle.setAttribute("filter", "url(#triGlow)");
      svg.appendChild(circle);
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", node.x);
      text.setAttribute("y", node.y + 5);
      text.setAttribute("fill", "#0a0a0a");
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "700");
      text.setAttribute("text-anchor", "middle");
      text.textContent = node.value;
      svg.appendChild(text);

      if (rowIdx === 0) {
        const topIndicator = document.createElementNS(NS, "text");
        topIndicator.setAttribute("x", node.x);
        topIndicator.setAttribute("y", node.y - 22);
        topIndicator.setAttribute("fill", "rgba(255,255,255,0.45)");
        topIndicator.setAttribute("font-size", "10");
        topIndicator.setAttribute("text-anchor", "middle");
        topIndicator.textContent = "base";
        svg.appendChild(topIndicator);
      }
    });
  });

  container.appendChild(svg);
}

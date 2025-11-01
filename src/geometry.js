export function generarCruceta(f) {
  const [y, m, d] = f.split("-").map(Number);
  const base = ((y % 100) + m + d) % 100;
  const rev = parseInt(
    String(base).padStart(2, "0").split("").reverse().join("")
  );
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
export function generarTrianguloInvertido(f) {
  const digits = f
    .replaceAll("-", "")
    .split("")
    .map((n) => parseInt(n, 10));
  const niv = [];
  let lvl = digits;
  while (lvl.length > 1) {
    niv.push(lvl);
    const next = [];
    for (let i = 0; i < lvl.length - 1; i++) {
      next.push((lvl[i] + lvl[i + 1]) % 10);
    }
    lvl = next;
  }
  niv.push(lvl);
  return niv;
}
export function dibujarTrianguloInvertido(c, niv) {
  const rows = niv.length;
  const width = 360,
    rowH = 28,
    p = 16,
    height = p * 2 + rowH * rows,
    NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("x", 0);
  bg.setAttribute("y", 0);
  bg.setAttribute("width", width);
  bg.setAttribute("height", height);
  bg.setAttribute("fill", "#0f141d");
  bg.setAttribute("stroke", "#1f2a3d");
  svg.appendChild(bg);
  for (let r = 0; r < rows; r++) {
    const nums = niv[r];
    const y = p + r * rowH;
    const rw = width - p * 2;
    const step = rw / nums.length;
    for (let i = 0; i < nums.length; i++) {
      const x = p + step * i + step / 2;
      const circ = document.createElementNS(NS, "circle");
      circ.setAttribute("cx", x);
      circ.setAttribute("cy", y);
      circ.setAttribute("r", 10);
      circ.setAttribute("fill", "rgba(212,167,44,0.15)");
      circ.setAttribute("stroke", "#d4a72c");
      svg.appendChild(circ);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", x);
      t.setAttribute("y", y + 4);
      t.setAttribute("fill", "#f0c75e");
      t.setAttribute("font-size", "12");
      t.setAttribute("text-anchor", "middle");
      t.textContent = nums[i];
      svg.appendChild(t);
    }
  }
  c.innerHTML = "";
  c.appendChild(svg);
}

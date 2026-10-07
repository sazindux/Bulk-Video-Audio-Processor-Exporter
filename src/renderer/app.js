// Task 0 bootstrap: show resolved binary paths and versions.
const table = document.getElementById('env');
const info = await window.bvape.getEnvInfo();
for (const [k, v] of Object.entries(info)) {
  const tr = document.createElement('tr');
  const td1 = document.createElement('td'); td1.textContent = k;
  const td2 = document.createElement('td'); td2.textContent = String(v);
  tr.append(td1, td2); table.append(tr);
}

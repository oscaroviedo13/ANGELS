#!/usr/bin/env python3
"""Uso:  python3 bump.py 1.3.1 "Qué cambió"
Actualiza version.js, worker/worker.js y CHANGELOG.md con la nueva versión."""
import re, sys, datetime
if len(sys.argv) < 3 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
    sys.exit('Uso: python3 bump.py X.Y.Z "descripción del cambio"')
v, nota, hoy = sys.argv[1], sys.argv[2], datetime.date.today().isoformat()
def sub(path, pat, rep):
    s = open(path, encoding="utf-8").read(); n = re.sub(pat, rep, s, count=1); open(path, "w", encoding="utf-8").write(n)
sub("version.js", r'app: "[^"]+", fecha: "[^"]+"', f'app: "{v}", fecha: "{hoy}"')
sub("worker/worker.js", r"WORKER_VERSION = '[^']+'", f"WORKER_VERSION = '{v}'")
s = open("CHANGELOG.md", encoding="utf-8").read()
s = s.replace("\n## ", f"\n## {v} – {hoy}\n- {nota}\n\n## ", 1)
open("CHANGELOG.md", "w", encoding="utf-8").write(s)
print("Versión", v, "lista. Sube los archivos a GitHub y crea la etiqueta v" + v)

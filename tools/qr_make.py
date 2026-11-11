# -*- coding: utf-8 -*-
"""QR 표 만들기 — qr-share.js 의 DATA 를 다시 채운다. 사용법: python tools/qr_make.py  (파이썬 segno 필요: pip install segno)
주소가 바뀌면 아래 URLS 를 고치고 다시 돌린다. 안내문(QR_안내문)도 같은 주소를 쓴다."""
import io, json, os, re, sys
import segno
LIVE = "https://ksinvaid.github.io/roundb-night-defense/"
META = "https://roundb-metaverse.roundb-metaverse.workers.dev/"
URLS = [
    LIVE + "intro/",                     # 라운드비 소개
    "https://roundb-seat-board-hyunwoo.roundb-metaverse.workers.dev/share",   # 4층 좌석 현황
    LIVE + "gallery/",                   # 공간 둘러보기
    LIVE + "road/",                      # 로드뷰 투어
    META + "?floor=3",                   # 3D 투어 3층
    META,                                # 3D 투어 4층
    LIVE + "lunch/",                     # 오늘 뭐 먹지
]
def rows(u):
    q = segno.make(u, error="m", micro=False)
    return ",".join("".join("1" if c else "0" for c in r) for r in q.matrix)
if __name__ == "__main__":
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "qr-share.js")
    s = io.open(p, encoding="utf-8", newline="").read()
    data = json.dumps({u: rows(u) for u in URLS}, ensure_ascii=False, separators=(",", ":"))
    s2, n = re.subn(r"/\*QR_DATA_START\*/.*?/\*QR_DATA_END\*/", lambda m: "/*QR_DATA_START*/" + data + "/*QR_DATA_END*/", s, flags=re.S)
    assert n == 1
    io.open(p, "w", encoding="utf-8", newline="").write(s2)
    print("OK", len(URLS), "주소,", len(s2), "bytes")

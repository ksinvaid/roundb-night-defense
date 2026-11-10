#!/usr/bin/env python3
r"""팬아트 갤러리에 그림 한 장을 거는 도구 (운영자용).

받은 그림 파일을
  - 긴 변 1200px 이하의 jpg  -> gallery/img/<id>.jpg
  - 긴 변 480px 의 썸네일 jpg -> gallery/img/<id>_t.jpg
로 줄여 저장하고(원본은 건드리지 않아요, 사진 속 위치·기기 정보(EXIF)는 지워져요),
gallery/items.json 맨 뒤에 항목을 더합니다. 화면에는 새로 건 그림이 맨 앞에 보여요.

사용 예
  python tools/add_gallery_item.py "C:/받은그림/아린.png" --title "아린 기사 그림" \
      --artist "별빛토끼" --kind human --source "쓰레드 @starbunny" \
      --note "아린이 제일 좋아서 그렸어요!" --desc "아린이 화살을 쏘는 장면이에요"
  python tools/add_gallery_item.py "C:/받은그림/지유.jpg" --title "지유 기사" --artist "달빛" --kind human \
      --link "https://www.threads.net/@moonlight_ji"      # 작가 계정 주소 1개(https 만, 운영자가 확인한 것만)
  python tools/add_gallery_item.py --list              # 걸린 그림 목록
  python tools/add_gallery_item.py --remove 20261110-01   # 내리기(이미지 파일도 같이 지움)

그 뒤  git add gallery && git commit -m "Add fan art" && git push  (푸시하면 5~10분 뒤 공개 페이지에 보여요)
필요한 것: Python 3 + Pillow (pip install pillow)
"""
import argparse
import datetime
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
GAL = ROOT / "gallery"
IMG_DIR = GAL / "img"
ITEMS = GAL / "items.json"

MAX_LONG = 1200      # 큰 그림의 긴 변(px)
THUMB_LONG = 480     # 썸네일의 긴 변(px)
LIM = {"title": 40, "artist": 20, "source": 40, "desc": 200, "note": 80}   # gallery.js 의 화면 표시 한도와 같아야 해요
ID_RE = re.compile(r"^[a-z0-9-]{1,40}$")                                    # 댓글 보안 규칙(itemId)과도 같아야 해요
RESERVED = {"wall"}                                                         # wall = 갤러리 맨 위 '모두의 한 줄' 이 쓰는 번호


def die(msg, code=1):
    print("오류: " + msg, file=sys.stderr)
    sys.exit(code)


def load_items():
    if not ITEMS.exists():
        return []
    try:
        data = json.loads(ITEMS.read_text(encoding="utf-8"))
    except Exception as e:
        die("gallery/items.json 을 읽을 수 없어요: %s" % e)
    if not isinstance(data, list):
        die("gallery/items.json 은 목록([ ... ])이어야 해요")
    return data


def save_items(items):
    GAL.mkdir(parents=True, exist_ok=True)
    tmp = ITEMS.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    tmp.replace(ITEMS)


def clean_link(value):
    """작가 계정 주소: https 만. javascript:·http:·아이디/비밀번호가 붙은 주소·공백이 든 주소는 거부."""
    v = (value or "").strip()
    if not v:
        return ""
    if len(v) > 200 or any(c.isspace() or c in "<>\"'\\" for c in v):
        die("--link 주소가 너무 길거나 쓸 수 없는 글자가 들어 있어요 (200자까지)")
    if not re.match(r"^https://", v, re.I):
        die("--link 는 https:// 로 시작하는 주소만 쓸 수 있어요 (javascript:, http:, 주소 없이 계정 이름만은 안 돼요)")
    try:
        u = urlsplit(v)
        host = u.hostname or ""
    except ValueError:
        die("--link 주소를 읽을 수 없어요")
    if u.scheme.lower() != "https" or u.username or u.password or "." not in host:
        die("--link 는 https://도메인/경로 모양이어야 해요 (아이디·비밀번호가 붙은 주소 불가)")
    return u.geturl()


def clip(name, value, limit):
    """한도를 넘으면 경고하고 자른다."""
    value = " ".join((value or "").split())     # 줄바꿈·연속 공백 정리
    if len(value) > limit:
        print("경고: %s 이(가) %d자를 넘어서 %d자까지만 쓰고 잘랐어요 (%d자 -> %d자)" % (name, limit, limit, len(value), limit))
        value = value[:limit].rstrip()
    return value


def next_id(items, date):
    base = date.replace("-", "")
    n = 1
    used = {str(x.get("id")) for x in items}
    while True:
        cand = "%s-%02d" % (base, n)
        if cand not in used:
            return cand
        n += 1


def make_images(src, item_id, dry):
    try:
        from PIL import Image, ImageOps
    except ImportError:
        die("Pillow 가 필요해요: pip install pillow")
    try:
        im = Image.open(src)
        im.load()
    except Exception as e:
        die("그림을 열 수 없어요(%s): %s" % (src, e))
    im = ImageOps.exif_transpose(im)             # 폰 사진의 회전 정보 반영
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))   # 투명한 배경은 흰색으로
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")

    def fit(img, long_side):
        w, h = img.size
        s = long_side / float(max(w, h))
        if s >= 1:
            return img.copy()
        return img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)

    big, thumb = fit(im, MAX_LONG), fit(im, THUMB_LONG)
    out_big, out_thumb = IMG_DIR / (item_id + ".jpg"), IMG_DIR / (item_id + "_t.jpg")
    if not dry:
        IMG_DIR.mkdir(parents=True, exist_ok=True)
        big.save(out_big, "JPEG", quality=85, optimize=True, progressive=True)     # EXIF 는 저장하지 않아요
        thumb.save(out_thumb, "JPEG", quality=80, optimize=True)
        for p in (out_big, out_thumb):
            kb = p.stat().st_size // 1024
            print("저장: %s (%d x %d, %d KB)" % (p.relative_to(ROOT), Image.open(p).size[0], Image.open(p).size[1], kb))
            if kb > 600:
                print("경고: 파일이 커요(%d KB). 공개 저장소에는 가벼운 이미지만 올려 주세요." % kb)
    else:
        print("(dry-run) %s %s, %s %s" % (out_big.name, big.size, out_thumb.name, thumb.size))
    return "gallery/img/" + item_id + ".jpg", "gallery/img/" + item_id + "_t.jpg"


def cmd_list():
    items = load_items()
    if not items:
        print("걸린 그림이 없어요.")
    for x in items:
        print("%-16s %-5s %-10s %s / %s" % (x.get("id"), x.get("kind"), x.get("date"), x.get("title"), x.get("artist")))


def cmd_remove(item_id):
    items = load_items()
    hit = [x for x in items if x.get("id") == item_id]
    if not hit:
        die("그런 id 가 없어요: " + item_id)
    items = [x for x in items if x.get("id") != item_id]
    save_items(items)
    for rel in (hit[0].get("img"), hit[0].get("thumb")):
        if rel and rel.startswith("gallery/img/"):
            p = ROOT / rel
            if p.exists():
                p.unlink()
    print("내렸어요: " + item_id + "  (댓글은 서버에 남아요. 필요하면 운영자 모드로 지우세요)")


def main():
    ap = argparse.ArgumentParser(description="팬아트 갤러리에 그림 걸기", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("image", nargs="?", help="걸 그림 파일(png/jpg/webp 등)")
    ap.add_argument("--title", help="제목 (필수, 40자)")
    ap.add_argument("--artist", default="", help="필명 (20자, 비우면 '익명')")
    ap.add_argument("--kind", choices=["human", "ai"], help="human = 사람이 그림, ai = AI 가 만듦 (필수)")
    ap.add_argument("--source", default="", help="출처 예: 쓰레드 아이디 (40자, 선택)")
    ap.add_argument("--desc", default="", help="설명 (200자, 선택)")
    ap.add_argument("--link", default="", help="작가 계정 주소 1개 (https 만, 선택 — 상세 화면에 '작가 계정' 링크로 보여요)")
    ap.add_argument("--note", default="", help="작가의 한마디 한 줄 (80자, 선택 — 넘으면 경고하고 자름)")
    ap.add_argument("--date", default="", help="날짜 YYYY-MM-DD (비우면 오늘)")
    ap.add_argument("--id", default="", help="그림 번호(영문 소문자·숫자·-, 비우면 날짜-번호 자동)")
    ap.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 보여 줘요")
    ap.add_argument("--list", action="store_true", help="걸린 그림 목록")
    ap.add_argument("--remove", metavar="ID", help="그림 내리기")
    a = ap.parse_args()

    if a.list:
        return cmd_list()
    if a.remove:
        return cmd_remove(a.remove)
    if not a.image or not a.title or not a.kind:
        ap.error("그림 파일, --title, --kind 는 꼭 필요해요 (--help 로 예시 보기)")
    src = Path(a.image)
    if not src.is_file():
        die("그림 파일을 찾을 수 없어요: " + a.image)

    date = a.date or datetime.date.today().isoformat()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        die("--date 는 2026-11-10 모양이어야 해요")
    items = load_items()
    item_id = a.id or next_id(items, date)
    if not ID_RE.match(item_id) or item_id in RESERVED:
        die("--id 는 영문 소문자·숫자·-(하이픈)만, 40자까지예요 ('wall' 은 쓸 수 없어요)")
    if any(x.get("id") == item_id for x in items):
        die("이미 있는 id 예요: " + item_id + "  (다른 --id 를 쓰거나 --remove 로 먼저 내려 주세요)")

    item = {
        "id": item_id,
        "title": clip("제목", a.title, LIM["title"]),
        "artist": clip("필명", a.artist, LIM["artist"]) or "익명",
        "source": clip("출처", a.source, LIM["source"]),
        "kind": a.kind,
        "date": date,
        "img": "",
        "thumb": "",
        "desc": clip("설명", a.desc, LIM["desc"]),
        "note": clip("작가의 한마디", a.note, LIM["note"]),
    }
    link = clean_link(a.link)
    if link:
        item["link"] = link
    item["img"], item["thumb"] = make_images(src, item_id, a.dry_run)
    items.append(item)
    if a.dry_run:
        print("(dry-run) items.json 에 더해질 항목:")
        print(json.dumps(item, ensure_ascii=False, indent=2))
        return
    save_items(items)
    print("걸었어요: %s  \"%s\" (%s)" % (item_id, item["title"], item["artist"]))
    print("다음: git add gallery && git commit -m \"Add fan art %s\" && git push" % item_id)


if __name__ == "__main__":
    main()

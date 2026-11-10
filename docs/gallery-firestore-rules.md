# 팬아트 갤러리 — Firestore 보안 규칙 조각 (댓글 galleryComments + 운영자 작품 galleryItems, 2026-11-10)

갤러리는 Firestore 컬렉션 두 개를 씁니다 — 작품 댓글 `galleryComments`, 운영자가 갤러리 화면에서 올리는 작품 `galleryItems`. **이 규칙이 게시되기 전에는 둘 다 읽기·쓰기가 막혀 있고**, 갤러리는 기본 작품(`gallery/items.json`)만으로 정상 동작하며 댓글 입력 칸은 "댓글은 곧 열려요", 운영자 모드의 추가·수정은 "서버 규칙이 아직 게시되지 않았어요"로 보입니다.
이 조각은 코드 변경과 별개로 **운영자가 Firebase 콘솔(프로젝트 `roundb-games` → Firestore → 규칙)에서 게시**해야 합니다. (이 저장소의 작업은 규칙을 게시하지 않습니다.)

## 데이터 모양 — galleryComments

| 필드 | 타입 | 뜻 | 서버 검사 |
|---|---|---|---|
| `itemId` | string | 작품 번호(`gallery/items.json` 의 `id`) | `items.json` 의 id 형식 `[a-z0-9-]{1,40}` |
| `nick` | string | 닉네임 | 1~12자, `운영자` 금지, 링크 금지 |
| `text` | string | 내용 | 1~200자, 링크 금지 |
| `ts` | timestamp | 서버 시각(클라이언트가 `REQUEST_TIME` 으로 요청) | `== request.time` |

- 문서 번호는 `뒤집은 시각 13자리 + 무작위 7자`(`[0-9]{13}[A-Za-z0-9]{7}`)입니다. 이름순으로 읽으면 최신 댓글이 먼저 나와서 **복합 색인 없이**(`itemId ==` 한 줄 조건 + 이름순) 최신순 목록이 됩니다.
- 읽기: 누구나(로그인 불필요). 쓰기: 익명 로그인 토큰이 있는 사람이 **새 문서 만들기만**. 수정은 전부 금지. 삭제는 운영자(`isMaster()`)만.
- 서버 쪽 도배 방지(글쓰기 간격 문서)는 두지 않았습니다 — 30초 간격은 화면에서만 지켜집니다(익명 계정은 무한히 만들 수 있어 서버 간격도 한계가 있음). 도배·욕설·광고는 운영자 모드로 지웁니다.

## 데이터 모양 — galleryItems (운영자 작품)

문서 번호 = 작품 번호(`[a-z0-9-]{1,40}`, 화면이 `f20261110-ab12` 꼴로 만듦). **문서 하나에 글 칸 + 썸네일 + 큰 그림이 모두 들어갑니다**(무료 한도 안에서 쓰려고 별도 파일 저장소를 쓰지 않음).

| 필드 | 타입 | 뜻 | 서버 검사 |
|---|---|---|---|
| `title` | string | 제목 | 1~40자 |
| `artist` | string | 필명 | 0~20자 |
| `source` | string | 출처(글자로만, 링크 칸 없음) | 0~40자 |
| `kind` | string | `human`(✋ 사람) / `ai`(🤖 AI) | 둘 중 하나 |
| `date` | string | 날짜 `YYYY-MM-DD` | 모양 검사 |
| `desc` | string | 설명 | 0~200자 |
| `note` | string | 작가의 한마디 | 0~80자 |
| `order` | int | 표시 순서(작을수록 앞). 새 작품은 맨 앞 번호를 받음 | 정수 |
| `hidden` | bool | 숨김(운영자에게만 보임) | 참/거짓 |
| `thumb` | string | 썸네일 JPEG data URL (긴 변 480px) | 100~40,000자 |
| `img` | string | 큰 그림 JPEG data URL (긴 변 1200px 이하, 브라우저가 한도 안으로 품질을 자동으로 낮춤) | 100~800,000자 (문서 1MiB 아래) |

- `thumb`·`img` 는 **둘이 같이 있거나 같이 없어야** 하고, 있으면 `title`·`kind`·`order` 도 있어야 합니다(= 전체 작품 문서).
- `thumb`·`img` 가 없는 문서 = **기본 작품(`gallery/items.json`)의 덮어쓰기**: 문서 번호가 기본 작품 번호와 같고 `hidden`(숨김)·`order`(순서)·글 칸(제목·필명 등) 중 바꾼 것만 들어 있습니다. 기본 작품은 파일이라 지우지는 못하고 숨기거나 `원래대로`(이 문서 삭제)로 되돌립니다.
- 읽기 공개 / 만들기·고치기·지우기는 운영자(`isMaster()`)만. 숨김은 **화면에서만 가려질 뿐** 규칙은 읽기를 막지 않으니 비밀 내용은 올리지 마세요.
- 읽기 절약: 목록은 `select` 로 `img` 를 뺀 칸만 읽고(썸네일은 포함), 큰 그림은 작품을 열 때 그 한 문서만 `mask.fieldPaths=img` 로 읽습니다. 목록은 한 번에 최대 100개 문서(= 읽기 100회)이고 3분 안에 다시 열면 새로 읽지 않습니다. 문서가 100개를 넘으면 목록에 다 담기지 않으므로 화면이 90개부터 운영자에게 경고하고 100개에서 새 작품을 막습니다.

## 붙여 넣을 규칙

기존 규칙 파일(`match /databases/{database}/documents { ... }` 안)의 **맨 아래 `match /{document=**}`(전부 거부) 바로 앞**에 아래 덩어리(댓글 + 작품 두 컬렉션)를 붙여 넣습니다. 기존 `isMaster()`·`signedIn()` 함수(문의·게임평 게시판 블록에 이미 있음)를 그대로 씁니다. 기존 내용은 하나도 바꾸지 않습니다.

```
    // ============================================================================
    // 팬아트 갤러리 작품 댓글 (2026-11-10)
    //   galleryComments/{번호}: itemId(작품 번호 = gallery/items.json 의 id) · nick · text · ts
    //   읽기 공개 / 새 문서 만들기만(익명 로그인) / 수정 금지 / 삭제는 마스터만
    //   noUrl: 링크 막기 — http(s)://, www., 흔한 도메인 꼴(abc.com · bit.ly …). @계정이름 처럼 글자로 적는 건 통과.
    //     (?is) = 대소문자 무시 + 줄바꿈 포함. 도메인 꼴은 'TLD 바로 뒤가 글자·숫자가 아닐 때'만(…com 뒤에 영문이 더 이어지면 통과).
    //     게시할 때 이 정규식에서 오류가 나면 (?is) 를 (?s) 로 줄이고 대문자 .COM 은 못 막는다는 점만 감수하면 된다.
    // ============================================================================
    function noUrl(s) {
      return !s.matches('(?is)(.*(https?:|www[.]|://).*)|(.*[a-z0-9][.](com|net|org|kr|co|me|io|ly|gl|to|cc|tv|xyz|app|dev|info|biz|link|site|shop|store|online|ai|gg|jp|cn|us|uk|de|fr|do|vc|im|so|sh|fm|page|top|club|live|blog|be|la|gd|gy|ws|ms)([^a-z0-9].*)?)');
    }
    function gcOk(d) {
      return d.keys().hasOnly(['itemId', 'nick', 'text', 'ts'])
          && d.keys().hasAll(['itemId', 'nick', 'text', 'ts'])
          && d.itemId is string && d.itemId.matches('[a-z0-9-]{1,40}')
          && d.nick is string && d.nick.size() >= 1 && d.nick.size() <= 12 && d.nick != '운영자' && noUrl(d.nick)
          && d.text is string && d.text.size() >= 1 && d.text.size() <= 200 && noUrl(d.text)
          && d.ts == request.time;
    }

    match /galleryComments/{id} {
      allow get: if true;
      allow list: if request.query.limit <= 100;
      allow create: if signedIn() && id.matches('[0-9]{13}[A-Za-z0-9]{7}') && gcOk(request.resource.data);
      allow update: if false;
      allow delete: if isMaster();
    }

    // ============================================================================
    // 팬아트 갤러리 작품 — 운영자가 갤러리 화면에서 올림 (2026-11-10)
    //   galleryItems/{작품 번호}: 읽기 공개 / 만들기·고치기·지우기는 마스터(isMaster)만.
    //   · 전체 작품 문서 = 글 칸 + thumb(≤ 40000자) + img(≤ 800000자) + title·kind·order 필수
    //   · thumb·img 가 없는 문서 = 기본 작품(gallery/items.json) 덮어쓰기(hidden · order · 글 칸만)
    // ============================================================================
    function giOk(d) {
      return d.keys().hasOnly(['title', 'artist', 'source', 'kind', 'date', 'desc', 'note', 'order', 'hidden', 'thumb', 'img'])
          && (!('title' in d) || (d.title is string && d.title.size() >= 1 && d.title.size() <= 40))
          && (!('artist' in d) || (d.artist is string && d.artist.size() <= 20))
          && (!('source' in d) || (d.source is string && d.source.size() <= 40))
          && (!('desc' in d) || (d.desc is string && d.desc.size() <= 200))
          && (!('note' in d) || (d.note is string && d.note.size() <= 80))
          && (!('kind' in d) || d.kind in ['human', 'ai'])
          && (!('date' in d) || (d.date is string && d.date.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')))
          && (!('order' in d) || d.order is int)
          && (!('hidden' in d) || d.hidden is bool)
          && (('thumb' in d) == ('img' in d))
          && (!('thumb' in d) || (d.thumb is string && d.thumb.size() >= 100 && d.thumb.size() <= 40000
                                 && d.img is string && d.img.size() >= 100 && d.img.size() <= 800000
                                 && 'title' in d && 'kind' in d && 'order' in d));
    }

    match /galleryItems/{id} {
      allow get: if true;
      allow list: if request.query.limit <= 100;
      allow create, update: if isMaster() && id.matches('[a-z0-9-]{1,40}') && giOk(request.resource.data);
      allow delete: if isMaster();
    }
```

### 규칙 설명 (헷갈리기 쉬운 곳)
- `matches('...')` 는 문자열 **전체**가 정규식과 맞아야 참입니다(RE2). 그래서 앞뒤에 `.*` 를 붙였고, `(?is)` 가 줄바꿈 속 링크도 찾습니다. 기존 게시판 규칙의 `noLink` 도 같은 방식입니다.
- `request.query.limit <= 100` : 목록 읽기는 반드시 `limit` 이 있어야 허용됩니다(화면은 댓글을 30개씩 읽음).
- `ts == request.time` : 화면이 `updateTransforms: setToServerValue REQUEST_TIME` 으로 보내는 서버 시각만 통과 — 시각 조작 불가.
- `giOk` 의 `'title' in d` 는 "그 칸이 문서에 있는가"입니다. 화면은 칸 일부만 고칠 때 `updateMask` 로 바뀐 칸만 보내는데, 규칙이 보는 `request.resource.data` 는 **합쳐진 결과 문서 전체**라서 같은 검사가 그대로 통합니다.
- `thumb`/`img` 에는 글자 모양(정규식) 검사를 하지 않습니다 — 큰 문자열에 정규식을 돌리면 규칙 계산이 무거워서이고, 쓰는 사람이 운영자뿐이며 화면이 `data:image/jpeg;base64,` 로 시작하는 값만 그림으로 씁니다.
- 링크 차단 목록(`noUrl` 의 TLD 목록)은 `gallery.js` 의 `TLD` 와 **같아야** 합니다. 한쪽만 고치면 화면은 통과시키는데 서버가 거절하는(또는 그 반대) 글이 생깁니다.

## 게시 전 확인(운영자)
1. 콘솔 규칙 편집기에서 위 덩어리를 붙인 뒤 **"규칙 시뮬레이터"**로 확인하면 좋습니다 — `galleryComments/<번호>` 에 `get`(인증 없이)이 허용되는지, `create` 에 `itemId='ai-sample-final'`·`nick='별'`·`text='안녕 @star'`·`ts=request.time` 이 허용되고 `text='naver.com'` 은 거절되는지.
2. `galleryItems/<번호>` 에서 `get`(인증 없이)이 허용되고, 운영자 계정으로 `create`(작은 `thumb`·`img` + `title`·`kind`·`order`)가 허용되며, 운영자가 아닌 계정의 `create` 는 거절되는지도 확인합니다.
3. 게시 후 작품 상세에서 댓글 남기기 → 새로고침해도 보이면 성공. 운영자 모드(문의·게임평 게시판 맨 아래 `운영자` → 구글 로그인)를 켜면 갤러리 댓글 옆에 [삭제] 버튼이 나타납니다.
4. 갤러리 머리글 `🔧 운영자` → 구글 로그인 → `＋ 작품 추가` 로 작은 그림 하나를 올려 보고(저장되면 규칙 OK), 시험 작품은 `삭제` 로 지웁니다.
5. 문제가 생기면 이 덩어리만 지우고 다시 게시하면 갤러리는 읽기 전용(그림만)으로 돌아갑니다. 다른 컬렉션에는 영향이 없습니다.

## 클라이언트가 보내는 요청 (참고)
- 읽기: `POST .../documents:runQuery?key=<웹 API 키>` — `where itemId == <키>`, `orderBy __name__ ASC`, `limit 10|30`, 다음 쪽은 `startAt referenceValue(마지막 문서)`.
- 쓰기: `POST .../documents:commit` (Authorization: Bearer 익명 토큰) — `update galleryComments/<번호>` 필드 3개 + `ts REQUEST_TIME`, `currentDocument.exists=false`.
- 작품 목록(공개 읽기): `POST .../documents:runQuery?key=<웹 API 키>` — `from galleryItems`, `select {title, artist, source, kind, date, desc, note, order, hidden, thumb}`(큰 그림 `img` 제외), `limit 100`. 큰 그림: `GET .../galleryItems/<번호>?mask.fieldPaths=img&key=...`.
- 작품 쓰기(운영자 토큰): `POST .../documents:commit` — 추가는 전체 문서 + `currentDocument.exists=false`, 수정·숨김·순서는 `updateMask` 로 바뀐 칸만(기본 작품은 문서가 없어도 만들어짐), 삭제는 `delete`. 순서를 바꾸면 바뀐 작품의 `order` 만 10단위로 다시 매겨 한 번에 보냅니다.
- 작품을 지우면 그 작품의 댓글(최대 100개)도 같은 운영자 토큰으로 지웁니다(`galleryComments` delete 는 운영자 허용).
- 운영자 삭제: `DELETE .../galleryComments/<번호>` (Authorization: Bearer 구글 로그인 토큰 — 게시판 운영자 모드가 켜져 있을 때만 화면에 삭제 버튼이 보임).

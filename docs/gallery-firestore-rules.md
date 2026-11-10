# 팬아트 갤러리 댓글 — Firestore 보안 규칙 조각 (2026-11-10)

갤러리 댓글·'모두의 한 줄'은 Firestore 컬렉션 `galleryComments` 를 씁니다. **이 규칙이 게시되기 전에는 댓글 읽기·쓰기가 모두 막혀 있고**, 갤러리는 읽기 전용(그림 보기)으로 정상 동작하며 입력 칸은 "댓글은 곧 열려요"로 보입니다.
이 조각은 코드 변경과 별개로 **운영자가 Firebase 콘솔(프로젝트 `roundb-games` → Firestore → 규칙)에서 게시**해야 합니다. (이 저장소의 작업은 규칙을 게시하지 않습니다.)

## 데이터 모양

| 필드 | 타입 | 뜻 | 서버 검사 |
|---|---|---|---|
| `itemId` | string | 작품 번호(`gallery/items.json` 의 `id`). 갤러리 맨 위 '모두의 한 줄'은 고정값 `wall` | `[a-z0-9-]{1,40}` |
| `nick` | string | 닉네임 | 1~12자, `운영자` 금지, 링크 금지 |
| `text` | string | 내용 | 1~200자(`wall` 은 1~100자), 링크 금지 |
| `ts` | timestamp | 서버 시각(클라이언트가 `REQUEST_TIME` 으로 요청) | `== request.time` |

- 문서 번호는 `뒤집은 시각 13자리 + 무작위 7자`(`[0-9]{13}[A-Za-z0-9]{7}`)입니다. 이름순으로 읽으면 최신 댓글이 먼저 나와서 **복합 색인 없이**(`itemId ==` 한 줄 조건 + 이름순) 최신순 목록이 됩니다.
- 읽기: 누구나(로그인 불필요). 쓰기: 익명 로그인 토큰이 있는 사람이 **새 문서 만들기만**. 수정은 전부 금지. 삭제는 운영자(`isMaster()`)만.
- 서버 쪽 도배 방지(글쓰기 간격 문서)는 두지 않았습니다 — 30초 간격은 화면에서만 지켜집니다(익명 계정은 무한히 만들 수 있어 서버 간격도 한계가 있음). 도배·욕설·광고는 운영자 모드로 지웁니다.

## 붙여 넣을 규칙

기존 규칙 파일(`match /databases/{database}/documents { ... }` 안)의 **맨 아래 `match /{document=**}`(전부 거부) 바로 앞**에 아래 덩어리를 붙여 넣습니다. 기존 `isMaster()`·`signedIn()` 함수(문의·게임평 게시판 블록에 이미 있음)를 그대로 씁니다. 기존 내용은 하나도 바꾸지 않습니다.

```
    // ============================================================================
    // 팬아트 갤러리 댓글 · 모두의 한 줄 (2026-11-10)
    //   galleryComments/{번호}: itemId(작품 번호 또는 'wall') · nick · text · ts
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
          && d.text is string && d.text.size() >= 1 && noUrl(d.text)
          && (d.itemId == 'wall' ? d.text.size() <= 100 : d.text.size() <= 200)
          && d.ts == request.time;
    }

    match /galleryComments/{id} {
      allow get: if true;
      allow list: if request.query.limit <= 100;
      allow create: if signedIn() && id.matches('[0-9]{13}[A-Za-z0-9]{7}') && gcOk(request.resource.data);
      allow update: if false;
      allow delete: if isMaster();
    }
```

### 규칙 설명 (헷갈리기 쉬운 곳)
- `matches('...')` 는 문자열 **전체**가 정규식과 맞아야 참입니다(RE2). 그래서 앞뒤에 `.*` 를 붙였고, `(?is)` 가 줄바꿈 속 링크도 찾습니다. 기존 게시판 규칙의 `noLink` 도 같은 방식입니다.
- `request.query.limit <= 100` : 목록 읽기는 반드시 `limit` 이 있어야 허용됩니다(화면은 한 줄 벽 10개·댓글 30개씩 읽음).
- `ts == request.time` : 화면이 `updateTransforms: setToServerValue REQUEST_TIME` 으로 보내는 서버 시각만 통과 — 시각 조작 불가.
- 링크 차단 목록(`noUrl` 의 TLD 목록)은 `gallery.js` 의 `TLD` 와 **같아야** 합니다. 한쪽만 고치면 화면은 통과시키는데 서버가 거절하는(또는 그 반대) 글이 생깁니다.

## 게시 전 확인(운영자)
1. 콘솔 규칙 편집기에서 위 덩어리를 붙인 뒤 **"규칙 시뮬레이터"**로 확인하면 좋습니다 — `galleryComments/<번호>` 에 `get`(인증 없이)이 허용되는지, `create` 에 `itemId='wall'`·`nick='별'`·`text='안녕 @star'`·`ts=request.time` 이 허용되고 `text='naver.com'` 은 거절되는지.
2. 게시 후 갤러리에서 한 줄 남기기 → 새로고침해도 보이면 성공. 운영자 모드(문의·게임평 게시판 맨 아래 `운영자` → 구글 로그인)를 켜면 갤러리 댓글 옆에 [삭제] 버튼이 나타납니다.
3. 문제가 생기면 이 덩어리만 지우고 다시 게시하면 갤러리는 읽기 전용(그림만)으로 돌아갑니다. 다른 컬렉션에는 영향이 없습니다.

## 클라이언트가 보내는 요청 (참고)
- 읽기: `POST .../documents:runQuery?key=<웹 API 키>` — `where itemId == <키>`, `orderBy __name__ ASC`, `limit 10|30`, 다음 쪽은 `startAt referenceValue(마지막 문서)`.
- 쓰기: `POST .../documents:commit` (Authorization: Bearer 익명 토큰) — `update galleryComments/<번호>` 필드 3개 + `ts REQUEST_TIME`, `currentDocument.exists=false`.
- 운영자 삭제: `DELETE .../galleryComments/<번호>` (Authorization: Bearer 구글 로그인 토큰 — 게시판 운영자 모드가 켜져 있을 때만 화면에 삭제 버튼이 보임).

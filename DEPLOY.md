# 핑(Ping) 배포 프롬프트

> 새 세션에서 아래 "복붙용 프롬프트"를 그대로 붙여넣으면 배포가 진행됩니다.
> 핑 폴더 = 라이브 앱 루트. 도메인 https://www.ping.ai.kr (GitHub Pages + 가비아 CNAME).

---

## 복붙용 프롬프트 (이걸 붙여넣으세요)

```
핑 앱 배포해줘. 아래 순서로 진행해줘:

1. 핑 폴더에서 git 상태 확인(git status --short)하고 변경된 파일 보여줘.
2. git add -A → git commit (커밋 메시지는 이번 변경 내용 한국어로 요약).
   - git 사용자 정보 없으면 user.email "yunagunwoo@gmail.com", user.name "yunagunwoo"로 로컬 설정.
   - 구글드라이브 마운트라 .lock/tmp_obj 권한 경고는 무시(커밋만 되면 정상).
3. git push origin main 시도.
   - 샌드박스엔 깃허브 인증이 없어서 push가 막히면, 나한테 PowerShell에서
     "git push origin main" 직접 실행하라고 안내해줘.
4. functions/ 폴더를 바꿨다면 firebase deploy --only functions 도 필요하다고 알려줘
   (이건 내 PC에서 실행). 안 바꿨으면 생략.
5. 배포 후 확인 방법 알려줘: 브라우저에서 https://www.ping.ai.kr/app.html?v=오늘날짜
   로 캐시 우회 접속. 설치형 앱은 새로고침하면 최신(SW network-first).
```

---

## 배포 절차 메모 (참고용)

**기본 배포 = git push.** PowerShell로 한 줄씩 (PowerShell은 `&&` 안 됨):

```
cd "C:\Users\ggyeo\내 드라이브\dev\핑"
git add -A
git commit -m "변경 내용 요약"
git push origin main
```

> Claude가 샌드박스에서 이미 커밋해둔 경우, 위 `git add`/`git commit`은
> "nothing to commit"이거나 lock 에러가 날 수 있는데 정상임 — `git push origin main`만 하면 됨.

### `index.lock` File exists 에러가 날 때

증상: `fatal: Unable to create '...​/.git/index.lock': File exists` +
"Another git process seems to be running...". 구글드라이브 동기화로 lock 파일이
안 지워지고 남아서 생김. 아래 한 줄로 정리(지워도 안전):

```
Remove-Item "C:\Users\ggyeo\내 드라이브\dev\핑\.git\index.lock" -ErrorAction SilentlyContinue
```

그래도 안 되면 HEAD.lock도 함께:

```
Remove-Item "C:\Users\ggyeo\내 드라이브\dev\핑\.git\HEAD.lock" -ErrorAction SilentlyContinue
```

지운 뒤 `git status`로 확인하고 다시 배포.

푸시되면 GitHub Pages가 `www.ping.ai.kr`에 자동 반영.

**Cloud Functions를 고쳤을 때만** 추가로 (같은 핑 폴더에서):

```
cd "C:\Users\ggyeo\내 드라이브\dev\핑"
firebase deploy --only functions
```

(asia-northeast3, Node 22 / 2nd Gen. 함수: onPing, onPoke, coachReminder, deadlineReminder)

## 확인 / 주의

- 라이브 확인: `https://www.ping.ai.kr/app.html?v=날짜` (캐시 우회). 단 정적 기본값만 보임(JS 렌더 X).
- 설치형 앱은 SW가 network-first라 새로고침 시 최신.
- **단, `firebase-messaging-sw.js`·아이콘 파일명을 바꿨으면** 앱 재실행/재설치가 필요할 수 있음.
- 푸시는 Claude 샌드박스에서 깃허브 인증이 안 돼 막힘 → 마지막 `git push`는 본인 PC에서.
- 커밋 도중 `.git/index.lock` 등 "Operation not permitted" 경고는 구글드라이브 동기화 특성이라 커밋만 완료되면 무시 가능.

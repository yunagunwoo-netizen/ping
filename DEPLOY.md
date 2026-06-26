# 핑(Ping) 배포 프롬프트

> 새 세션에서 아래 "복붙용 프롬프트"를 그대로 붙여넣으면 배포가 진행됩니다.
> 핑 폴더 = 라이브 앱 루트. 도메인 https://www.ping.ai.kr (GitHub Pages + 가비아 CNAME).

---

## 복붙용 프롬프트 (이걸 붙여넣으세요)

```
핑 앱 변경분 배포 준비해줘. 아래 순서로:

1. 코드 수정이 끝나면, 샌드박스에서 git commit/push는 하지 마.
   (샌드박스 git이 구글드라이브에 .lock 파일을 남겨서 내 PC git이 막힘)
2. 대신 "이제 PC에서 배포하세요" 하고 아래 PowerShell 명령을 그대로 줘.
   커밋 메시지는 이번 변경 내용 한국어로 요약해서 넣어줘:

   Get-ChildItem "C:\Users\ggyeo\내 드라이브\dev\핑\.git" -Recurse -Filter "*.lock" -Force | Remove-Item -Force
   cd "C:\Users\ggyeo\내 드라이브\dev\핑"
   git add -A
   git commit -m "<이번 변경 요약>"
   git push origin main

3. functions/ 폴더를 바꿨다면 firebase deploy --only functions 도 필요하다고 알려줘
   (이것도 내 PC에서 실행). 안 바꿨으면 생략.
4. 배포 후 확인: 브라우저에서 https://www.ping.ai.kr/app.html?v=오늘날짜 로 캐시 우회 접속.
   설치형 앱은 새로고침하면 최신(SW network-first).
```

---

## 배포 절차 메모 (참고용)

**기본 배포 = git push.** PowerShell에서 아래를 한 줄씩 (PowerShell은 `&&` 안 됨).
**첫 줄(모든 .lock 일괄 제거)을 항상 먼저** 실행하면 lock 에러를 예방할 수 있음:

```
Get-ChildItem "C:\Users\ggyeo\내 드라이브\dev\핑\.git" -Recurse -Filter "*.lock" -Force | Remove-Item -Force
cd "C:\Users\ggyeo\내 드라이브\dev\핑"
git add -A
git commit -m "변경 내용 요약"
git push origin main
```

`git commit` 후 `[main ...]`, `git push` 후 `main -> main`이 보이면 성공.
LF→CRLF 경고는 무시해도 됨(자동 줄바꿈 변환 안내).

### lock 에러(`index.lock` / `HEAD.lock` File exists)가 날 때

증상: `fatal: Unable to create '...​/.git/...lock': File exists` +
"Another git process seems to be running...". 원인은 Claude가 샌드박스에서
git을 건드릴 때 구글드라이브로 동기화된 `.lock` 파일이 안 지워지고 남아서임.
**해결 = 위 명령 첫 줄로 .git 안의 모든 `.lock`을 한 번에 제거** 후 다시 배포:

```
Get-ChildItem "C:\Users\ggyeo\내 드라이브\dev\핑\.git" -Recurse -Filter "*.lock" -Force | Remove-Item -Force
```

(개별 `index.lock`만 지우면 `HEAD.lock` 등이 또 막을 수 있으니 한 번에 제거가 확실함.)

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
- 커밋·푸시는 항상 **본인 PC에서** (샌드박스 git 인증 없음 + .lock 잔여 문제). Claude는 코드 수정까지만.
- lock 에러가 나면 위 "lock 에러" 섹션의 **모든 .lock 일괄 제거** 명령을 먼저 실행.

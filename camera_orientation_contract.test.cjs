'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.resolve(__dirname, 'app.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.resolve(__dirname, 'sw.js'), 'utf8');

test('세로 고정 가족앱도 Android의 물리적 가로 전환을 감지해 카메라를 안정화한다', () => {
  assert.match(html, /function androidPhysicalOrientation\(event\)[\s\S]*Math\.abs\(gamma\) >= 45/);
  assert.match(html, /function handleAndroidPhysicalOrientation\(event\)[\s\S]*next\.startsWith\('landscape'\)[\s\S]*scheduleCameraOrientationRestart\(\)/);
  assert.match(html, /window\.addEventListener\('deviceorientation', handleAndroidPhysicalOrientation, \{ passive: true \}\)/);
});

test('촬영 미리보기는 핑 제출에 필요한 항목만 남긴다', () => {
  const preview = html.match(/<!-- PREVIEW -->[\s\S]*?<\/div>\s*\n\s*<!-- MYPAGE -->/);
  assert(preview, '미리보기 화면을 찾지 못했습니다');
  assert.doesNotMatch(preview[0], /인화 전 사진 점검|굿즈 인화 구도 미리보기|고화질 앨범 원본/);
  assert.match(preview[0], /id="withDubiChk"[\s\S]*id="gatherChk"[\s\S]*id="pingBtn"/);
});

test('가족앱은 오전 6시부터 자정까지 새 핑을 받는다', () => {
  assert.equal((html.match(/getHours\(\) < 6/g) || []).length, 2);
  assert.match(html, /오전 6시부터 보낼 수 있어요! \(6시~자정\)/);
  assert.match(html, /if \(h < 6\)[\s\S]*?setHours\(6, 0, 0, 0\)[\s\S]*?매일 6시 시작/);
  assert.match(html, /매일 6~24시 한 장/);
});

test('메인 뚜비 스킨은 배포 때 교체된 파일을 새 주소로 불러온다', () => {
  assert.match(html, /const ACTIVE_DUBI_SKIN_REV = '20260929-sportsday';/);
  assert.match(html, /active\.img\.replace\(\/\\\.png\$\/i, '-skin\.png'\)/);
  assert.match(html, /\$\{skinSrc\}\?rev=\$\{ACTIVE_DUBI_SKIN_REV\}/);
});

test('가족앱 배포 버전과 서비스워커 캐시 버전이 함께 올라간다', () => {
  assert.match(html, /id="verStamp"[^>]*>v36</);
  assert.match(serviceWorker, /CACHE_NAME = 'ping-v36'/);
});

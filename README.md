This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 특허 심사 리포트

`/patent-review.html`에서 팀 액세스 코드와 출원·공개·등록번호를 입력하고 **리포트 만들기**를 누릅니다. 형식이 겹치는 경우 **검색 설정**에서 번호 유형을 지정할 수 있습니다. 페이지에 서지·패밀리·이력을 표시한 뒤 기관 API가 제공하는 공개 심사 PDF를 목록 순서대로 모두 요약합니다. 호출 한도에 걸려 재시도 시간이 제공되면 기다렸다가 해당 문서를 한 번 다시 요청합니다. 끝내 처리되지 않은 문서의 사유를 표시하고 다음 문서를 계속 요약합니다. 요약한 PDF가 없고 기관이 이력을 제공한 경우에는 공개 이력을 요약합니다. **PowerPoint 내려받기**를 누르면 현재 보고서를 편집 가능한 PPTX로 저장합니다.

**검색 설정 → 공식 열람처 및 수동 정리**에서는 팀 코드 없이 기관 링크를 찾거나 이미 확보한 PDF에서 브라우저로 주요 문구를 발췌할 수 있습니다. 파일당 20 MiB 및 80쪽까지 읽으며, 영어·한국어·중국어 간체 이미지 PDF는 스캔 10쪽까지 문자 인식합니다.

패밀리 표의 지원 번호를 누르면 해당 관할의 기록을 다시 조회합니다.

번호는 국가 코드, 하이픈, 쉼표, 슬래시 없이 입력해도 됩니다(예: `11234231`, `US 11,234,231`, `1020230010262`). 같은 번호를 가진 특허가 여러 건이면 후보 목록이 나오고, 하나를 고르면 그 특허로 리포트를 만듭니다. **검색 설정 → 데이터 출처**에서 검색과 리포트에 쓸 자료를 고릅니다.

| 데이터 출처 | 동작 |
| --- | --- |
| 자동 · 미국은 EPO (기본) | 미국 번호는 EPO로 검색합니다. 다른 관할은 `WINTELIPS_ACCESS_TOKEN`이 있으면 WINTELIPS로 검색하고, 없거나 WINTELIPS 검색이 실패하면 공식 기관 API로 검색 |
| WINTELIPS | WINTELIPS MCP의 번호 검색(출원·등록·문헌·공개번호, 전체 국가), 서지, 상태, 이력, 패밀리, 발명자를 사용. 한국 건은 의견제출통지서·거절결정서 본문을 Claude로 요약 |
| 공식 기관 API | 번호를 가능한 관할·번호 유형으로 나눠(예: US 등록번호와 US 출원번호) 아래 기관 API로 각각 조회 |

| 관할 | 자동 조회 | 원문 열람 |
| --- | --- | --- |
| KR | KIPRISPlus 서지, DOCDB 패밀리, 행정처리 이력 | 의견제출통지서, 거절결정서, 등록결정서 PDF. 기타 문서는 KIPRIS에서 열람 |
| US | EPO OPS에서 미국 공개·등록번호로 서지, INPADOC 패밀리와 법적 이벤트 조회 | Espacenet 직접 검색은 팀 코드 없이 사용 가능. 개별 미국 심사 문서는 공식 심사철에서 열람 |
| EP | EPO OPS 서지, INPADOC 패밀리, Register의 절차 이력. OPS 키가 없으면 EP 공보번호로 공개공보 서지 조회 | EPO Publication Server의 공개 검색보고서(A1·A3·A4) 자동 요약. 심사관 통지와 당사자 서류는 European Patent Register에서 열람 |
| CN 및 기타 지원 관할 | EPO OPS 서지, INPADOC 패밀리 및 제공 범위 내 법적 이벤트 | CNIPA, 해당 특허청 또는 Global Dossier에서 열람 |
| UPC | 입력한 사건번호와 공개 결정·명령 열람처 표시 | UPC에서 공개 결정문 열람 |

운영 호스트의 프로젝트 설정에서 아래 값을 서버 환경 변수 또는 비밀로 등록하고 대상 환경을 다시 배포합니다. Cloudflare Pages는 **Settings → Variables and Secrets**, Vercel은 **Settings → Environment Variables**를 사용합니다. 로컬에서는 같은 이름을 `.env.local`에 설정한 후 `npm ci && npm run dev`를 실행합니다. 브라우저에는 팀 공유 코드만 입력합니다.

Cloudflare Pages에서 자동 조회 및 요약을 쓰려면 **Settings → Functions → Compatibility flags**의 Preview 및 Production 환경에 `nodejs_compat`을 설정하고 재배포해야 합니다.

| 변수 | 설정 |
| --- | --- |
| `PATENT_REVIEW_ACCESS_CODE` | 팀용 임의 문자열. 16자 이상, HTTP 헤더로 전송 가능한 ASCII 사용 |
| `KIPRIS_API_KEY` | 공개·등록공보, 특허 패밀리, 행정처리 이력, 중간서류철 3종(의견제출통지서·거절결정서·등록결정서) 이용 권한이 있는 KIPRISPlus 키. 상품마다 이용 신청 승인이 필요하며, 미승인 상품은 코드 30을 반환합니다 |
| `EPO_OPS_KEY`, `EPO_OPS_SECRET` | EPO Open Patent Services 앱의 Consumer Key와 Secret |
| `ANTHROPIC_API_KEY` | Claude Messages API 키. 모델은 `claude-opus-5-5` |
| `WINTELIPS_ACCESS_TOKEN` | 선택 사항. 팀이 함께 쓰는 WINTELIPS 액세스 토큰. 아래 토큰 발급 스크립트로 받음 |
| `WINTELIPS_REFRESH_TOKEN`, `WINTELIPS_CLIENT_ID`, `WINTELIPS_CLIENT_SECRET` | 선택 사항. 넣어 두면 액세스 토큰이 만료됐을 때 서버가 자동으로 갱신 |
| `WINTELIPS_MCP_URL` | 선택 사항. 기본값 `https://mcp.wipsclip.co.kr/mcp` |

WINTELIPS 공용 토큰은 관리자가 한 번 로그인해 발급합니다. 프로젝트 폴더에서 `node scripts/wintelips-token.mjs`를 실행하면 브라우저에 WINTELIPS 로그인 화면이 열리고, 로그인이 끝나면 토큰이 `.env.local`에 저장됩니다(화면에는 출력하지 않음). 저장된 `WINTELIPS_*` 값을 운영 호스트의 비밀로 옮긴 뒤 재배포합니다. 스크립트는 갱신을 한 번 시험해 **리프레시 토큰 회전 여부**를 알려 줍니다. 회전이 있으면 서버의 리프레시 토큰은 한 번만 쓸 수 있으므로, 만료될 때마다 `node scripts/wintelips-token.mjs --refresh`로 새 값을 받아 비밀을 교체해야 합니다.

번호 아래 **AI에게 요청할 내용** 칸에 원하는 보고서 내용을 적고 리포트를 만들면(예: "거절이유와 인용발명을 표로 정리해 줘"), 문서 요약이 끝난 뒤 화면의 서지·이력·패밀리·문서 요약을 Claude에 함께 보내 답변을 받습니다. 리포트 아래 **AI 요청** 칸으로 추가 요청도 할 수 있습니다. 답변은 문서 요약에 추가되고 PowerPoint에도 들어갑니다.

자동 요약은 기관이 제공하는 문서당 최대 12 MiB의 PDF 또는 공개 이력 데이터를 Anthropic Messages API에 전달합니다. 이 기능은 조회 기록, PDF, 요약을 사이트 저장소에 기록하지 않습니다.

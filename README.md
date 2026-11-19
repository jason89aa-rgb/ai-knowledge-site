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

`/patent-review.html`에서 팀 액세스 코드와 출원·공개·등록번호를 입력하고 **리포트 만들기**를 누릅니다. 형식이 겹치는 경우 **검색 설정**에서 번호 유형을 지정할 수 있습니다. 페이지에 서지·패밀리·이력을 표시한 뒤 검색 결과에서 우선순위가 높은 공개 PDF를 최대 3건까지 Claude로 자동 요약합니다. 요약한 PDF가 없고 기관이 이력을 제공한 경우에는 공개 이력을 요약합니다. **PowerPoint 내려받기**를 누르면 현재 보고서를 편집 가능한 PPTX로 저장합니다.

**검색 설정 → 공식 열람처 및 수동 정리**에서는 팀 코드 없이 기관 링크를 찾거나 이미 확보한 PDF에서 브라우저로 주요 문구를 발췌할 수 있습니다. 파일당 20 MiB 및 80쪽까지 읽으며, 영어·한국어·중국어 간체 이미지 PDF는 스캔 10쪽까지 문자 인식합니다.

패밀리 표의 지원 번호를 누르면 해당 관할의 기록을 다시 조회합니다.

| 관할 | 자동 조회 | 원문 열람 |
| --- | --- | --- |
| KR | KIPRISPlus 서지, DOCDB 패밀리, 행정처리 이력 | 의견제출통지서, 거절결정서, 등록결정서 PDF. 기타 문서는 KIPRIS에서 열람 |
| US | USPTO ODP 서지, 계속출원 관계, 거래 이력, 공개 심사 문서. EPO OPS 설정 시 해외 패밀리 | 목록에서 기관이 제공하는 PDF를 열거나 요약 |
| EP | EPO OPS 서지, INPADOC 패밀리, Register의 절차 이력. OPS 키가 없으면 EP 공보번호로 공개공보 서지 조회 | EPO Publication Server의 공개 검색보고서(A1·A3·A4) 자동 요약. 심사관 통지와 당사자 서류는 European Patent Register에서 열람 |
| CN 및 기타 지원 관할 | EPO OPS 서지, INPADOC 패밀리 및 제공 범위 내 법적 이벤트 | CNIPA, 해당 특허청 또는 Global Dossier에서 열람 |
| UPC | 입력한 사건번호와 공개 결정·명령 열람처 표시 | UPC에서 공개 결정문 열람 |

운영 호스트의 프로젝트 설정에서 아래 값을 서버 환경 변수 또는 비밀로 등록하고 대상 환경을 다시 배포합니다. Cloudflare Pages는 **Settings → Variables and Secrets**, Vercel은 **Settings → Environment Variables**를 사용합니다. 로컬에서는 같은 이름을 `.env.local`에 설정한 후 `npm ci && npm run dev`를 실행합니다. 브라우저에는 팀 공유 코드만 입력합니다.

Cloudflare Pages에서 자동 조회 및 요약을 쓰려면 **Settings → Functions → Compatibility flags**의 Preview 및 Production 환경에 `nodejs_compat`을 설정하고 재배포해야 합니다.

| 변수 | 설정 |
| --- | --- |
| `PATENT_REVIEW_ACCESS_CODE` | 팀용 임의 문자열. 16자 이상, HTTP 헤더로 전송 가능한 ASCII 사용 |
| `KIPRIS_API_KEY` | 공개·등록공보, 특허 패밀리, 행정처리 이력, 중간서류철 3종 이용 권한이 있는 KIPRISPlus 키 |
| `USPTO_API_KEY` | USPTO Open Data Portal 키 |
| `EPO_OPS_KEY`, `EPO_OPS_SECRET` | EPO Open Patent Services 앱의 Consumer Key와 Secret |
| `ANTHROPIC_API_KEY` | Claude Messages API 키. 모델은 `claude-opus-5-5` |

자동 요약은 기관이 제공하는 문서당 최대 12 MiB의 PDF 또는 공개 이력 데이터를 Anthropic Messages API에 전달합니다. 이 기능은 조회 기록, PDF, 요약을 사이트 저장소에 기록하지 않습니다.

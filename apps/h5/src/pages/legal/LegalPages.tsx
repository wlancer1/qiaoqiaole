import { useNavigate } from 'react-router-dom';

type LegalPageKind = 'agreement' | 'privacy';

const legalPageContent: Record<LegalPageKind, { title: string; intro: string; sections: Array<{ heading: string; paragraphs: string[] }> }> = {
  agreement: {
    title: '用户协议',
    intro: '欢迎使用超级拼。请在使用服务前仔细阅读本协议，注册或使用我们的服务即表示你理解并同意本协议内容。',
    sections: [
      { heading: '账号与服务', paragraphs: ['超级拼为你提供拼豆图纸创作、作品保存、分图、拼豆及社区交流等功能。你需要使用真实、有效的手机号注册账号，并妥善保管登录凭证。', '账号仅限本人使用。发现账号异常、被盗或存在未经授权的登录时，请及时联系我们。'] },
      { heading: '内容与使用规范', paragraphs: ['你上传、创作或发布的内容应当由你合法拥有或已获得必要授权，不得侵犯他人的知识产权、隐私权或其他合法权益。', '不得利用本服务制作、发布违法违规、欺诈、骚扰、恶意攻击或破坏平台正常运行的内容。'] },
      { heading: '作品与社区内容', paragraphs: ['你保留对原创作品的权利。为提供存储、展示、分享和处理功能，你授予超级拼在服务范围内使用相关内容的必要许可。', '公开发布到社区的内容可能被其他用户浏览、收藏、评论或分享，请在发布前确认内容适合公开展示。'] },
      { heading: '服务变更与终止', paragraphs: ['我们会持续优化产品，可能对功能进行调整、升级或暂停，并尽量通过产品内提示告知重要变化。', '如你违反本协议或相关法律法规，我们可能采取限制功能、删除内容或停止服务等措施。'] },
      { heading: '协议更新与联系我们', paragraphs: ['当服务或法律要求发生变化时，我们可能更新本协议。更新后的协议会在本页面公布，继续使用服务即视为接受更新内容。', '如对本协议有疑问，请通过产品提供的联系方式与我们联系。'] },
    ],
  },
  privacy: {
    title: '隐私政策',
    intro: '我们重视你的个人信息和隐私。本政策说明我们在你使用超级拼时会收集哪些信息、如何使用以及你可以如何管理这些信息。',
    sections: [
      { heading: '我们如何使用信息', paragraphs: ['为完成注册、登录和账号安全校验，我们会处理你的手机号、登录凭证及必要的设备和网络信息。', '为保存和同步你的创作，我们会处理你主动提交的作品名称、画布数据、图片、库存及社区互动内容。'] },
      { heading: '信息存储与保护', paragraphs: ['我们会采取访问控制、加密传输和必要的安全措施保护个人信息，并仅在实现服务所需的期限内保存。', '你应妥善保管账号凭证。若发现个人信息或账号可能泄露，请及时联系我们。'] },
      { heading: '第三方服务', paragraphs: ['部分功能可能依赖短信、对象存储、内容处理或登录安全等第三方服务。我们会要求服务提供方仅按照约定处理必要信息。', '除非获得你的授权、法律法规要求或为保护用户和平台安全，我们不会出售你的个人信息。'] },
      { heading: '你的权利', paragraphs: ['你可以通过产品内功能查看、修改或删除部分账号和作品信息，也可以申请注销账号。', '在法律允许的范围内，你可以向我们询问个人信息处理情况，或要求更正、删除和限制处理相关信息。'] },
      { heading: '未成年人保护与政策更新', paragraphs: ['未成年人应在监护人同意和指导下使用本服务。若我们发现未经监护人同意收集了未成年人信息，会依法采取删除等措施。', '我们会根据服务变化和法律要求更新本政策，并在本页面展示最新版本。'] },
    ],
  },
};

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  const navigate = useNavigate();
  const content = legalPageContent[kind];

  return (
    <main className="legal-page" aria-label={content.title}>
      <div className="legal-page-inner">
        <header className="legal-page-header">
          <button type="button" className="legal-back-button" aria-label="返回上一页" onClick={() => navigate(-1)}>
            <span aria-hidden="true">‹</span><span>返回</span>
          </button>
          <span className="legal-page-kicker">超级拼 · 服务条款</span>
          <h1>{content.title}</h1>
          <p className="legal-page-updated">更新日期：2026 年 8 月 17 日</p>
        </header>
        <div className="legal-page-card">
          <p className="legal-page-intro">{content.intro}</p>
          {content.sections.map((section, index) => (
            <section key={section.heading} className="legal-section" aria-labelledby={index === 0 ? 'legal-section-title' : undefined}>
              <h2 id={index === 0 ? 'legal-section-title' : undefined}>{index + 1}. {section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

export function UserAgreementPage() { return <LegalPage kind="agreement" />; }
export function PrivacyPolicyPage() { return <LegalPage kind="privacy" />; }

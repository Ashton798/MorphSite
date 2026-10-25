export function studioIntent(prompt: string): { website: boolean; image: boolean; video: boolean } {
  const text = prompt.toLowerCase();
  const generate = /生成|制作|做|产出|设计|优化|修图|精修|美化|增强|换背景|create|generate|make|retouch|enhance/.test(text);
  const media = generate && !/分镜|storyboard/.test(text);
  const image = media && /宣传图|推广图|海报|图片|poster|image/.test(text);
  const video = media && /视频|video/.test(text);
  return { website: (!image && !video) || /网站|网页|website|landing page/.test(text), image, video };
}

/** A fresh description starts a product campaign, even when an old draft exists. */
export function campaignIntent(prompt: string, hasSpec: boolean, freshUpload: boolean) {
  const detected = studioIntent(prompt);
  const edit = /改成|改为|换成|修改|调整|优化|精修|美化|增强|换背景|撤销|标题|配色|布局|分镜|change|edit|retouch|enhance/i.test(prompt);
  const campaign = /整套|全套|宣传方案|推广方案|一键/.test(prompt)
    || (!edit && (freshUpload || (!detected.image && !detected.video) || (detected.website && detected.image && detected.video)));
  return { ...detected, ...(campaign ? { website: true, image: true, video: true } : {}), campaign: campaign || !hasSpec && detected.website };
}

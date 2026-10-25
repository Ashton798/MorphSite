"""Gateway Seedance asynchronous video with native audio; no paid retries."""
from pathlib import Path
from urllib.parse import quote, urlparse
import httpx
from ..config import settings
from .bailian_provider import BailianProviderError, BailianVideoTask, _data_uri

class NextVideoProvider:
    def __init__(self):
        self.model = settings.openai_next_video_model
        self.base = settings.openai_next_base_url.rstrip('/').removesuffix('/v1')
        if not self.model or not settings.openai_next_api_key or not self.base.startswith('https://'):
            raise BailianProviderError('聚合平台视频配置不完整。', category='not_configured')

    async def request(self, method, path, payload=None):
        try:
            async with httpx.AsyncClient(timeout=55, follow_redirects=False) as client:
                response = await client.request(method, self.base+path, headers={'Authorization':'Bearer '+settings.openai_next_api_key}, json=payload)
        except httpx.HTTPError as exc:
            raise BailianProviderError('视频接口连接超时；未自动重复创建任务。',category='provider_timeout') from exc
        if response.status_code >= 400:
            if 'insufficient_user_quota' in response.text:
                raise BailianProviderError('聚合平台的视频上游额度不足（insufficient_user_quota）。请检查平台余额或联系平台补充视频渠道额度；未生成视频，也未使用静态图片替代。',category='quota_or_rate_limit',status_code=402)
            raise BailianProviderError(f'聚合视频接口返回 HTTP {response.status_code}，未自动改用其他模型。', category='provider_error',status_code=response.status_code)
        try:
            return response.json()
        except ValueError as exc:
            raise BailianProviderError('视频接口返回无效数据。',category='invalid_response') from exc

    async def create_task(self, prompt, first_frame=None):
        direction = ('Original premium product launch film. Precise motion-control camera, macro material detail, moving rim light, real camera orbit and visible parallax, then complete hero reveal. '
                     'Preserve the entire reference product silhouette, structure, packaging, colors and markings. Never remove stems, leaves, handles, components or packaging. Do not invent a different product or detach any part. End with the whole original product visible. Controlled minimal studio lighting, cinematic contrast. '
                     'Create real moving footage with multiple meaningful shots. No slideshow, no static photo zoom, no invented logos or text. '
                     'Native audio: original restrained electronic score, soft low pulse, airy transitions and resolving tonal chime. No speech. Product brief: ')
        text=direction+prompt
        content=[{'type':'text','text':text}]
        if first_frame:
            content.append({'type':'image_url','image_url':{'url':_data_uri(first_frame)},'role':'first_frame'})
        payload={'model':self.model,'prompt':text,'content':content,'duration':5 if 'seedance' in self.model else '5','seconds':'5','size':'1280x720','resolution':'720p','generate_audio':True}
        result=await self.request('POST','/v1/videos',payload)
        task_id=result.get('id') or result.get('task_id')
        if not isinstance(task_id,str) or not task_id:
            raise BailianProviderError('视频平台未返回任务编号。',category='invalid_response')
        return BailianVideoTask(task_id,'PENDING')

    async def fetch_task(self, task_id):
        result=await self.request('GET','/v1/videos/'+quote(task_id,safe=''))
        body=result.get('data') if isinstance(result.get('data'),dict) else result
        status={'queued':'PENDING','pending':'PENDING','processing':'RUNNING','in_progress':'RUNNING','running':'RUNNING','completed':'SUCCEEDED','succeeded':'SUCCEEDED','failed':'FAILED','cancelled':'CANCELED','canceled':'CANCELED'}.get(body.get('status'),'UNKNOWN')
        content=body.get('content') or {}
        url=body.get('url') or body.get('video_url') or (content.get('video_url') if isinstance(content,dict) else None)
        return BailianVideoTask(task_id,status,url)

    async def save_result(self, task, output_path: Path):
        # Signed model output URLs are untrusted: reject local/private network targets.
        import ipaddress, socket
        url=task.result_url or self.base+'/v1/videos/'+quote(task.task_id,safe='')+'/content'
        parsed=urlparse(url)
        if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:
            raise BailianProviderError('视频下载地址无效。',category='invalid_response')
        try:
            addresses=socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
            # This workstation's proxy resolves public sites to synthetic IPs.
            # Only the exact CDN observed in a successful gateway result may bypass that check.
            trusted_cdn = parsed.hostname.lower() == 'r2cdn.agisuitepro.com' and parsed.port in (None,443)
            if not addresses or (not trusted_cdn and any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses)):
                raise ValueError('private address')
        except (ValueError,OSError) as exc:
            raise BailianProviderError('视频下载地址不受信任。',category='invalid_response') from exc
        headers={'Authorization':'Bearer '+settings.openai_next_api_key} if url.startswith(self.base+'/') else {}
        try:
            async with httpx.AsyncClient(timeout=120,follow_redirects=False) as client:
                response=await client.get(url,headers=headers)
                response.raise_for_status()
                data=response.content
        except httpx.HTTPError as exc:
            raise BailianProviderError('视频文件下载失败，可继续查询原任务。',category='provider_unavailable') from exc
        if b'ftyp' not in data[:32]:
            raise BailianProviderError('平台未返回有效 MP4。',category='invalid_response')
        output_path.write_bytes(data)
        return output_path

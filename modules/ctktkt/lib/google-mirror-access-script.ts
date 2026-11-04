// Run separately from syncNow: permissions must never force a full data export.
export const GOOGLE_MIRROR_ACCESS_SCRIPT = String.raw`
function configureViewerAccess() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Đang đồng bộ; hãy chờ hoàn tất rồi cấu hình quyền.');
  const done = [], failures = [];
  try {
    CONFIG.files.forEach(target => {
      try {
        const path = '/files/' + encodeURIComponent(target.id);
        const metadata = mirrorDriveRequest(path + '?fields=id,mimeType,parents,ownedByMe,writersCanShare,copyRequiresWriterPermission');
        if (metadata.mimeType !== 'application/vnd.google-apps.spreadsheet' || metadata.ownedByMe !== true) throw new Error('Chỉ chủ sở hữu được cấu hình file này.');
        // Do not change a folder or silently leave inherited edit access in place.
        (metadata.parents || []).forEach(parent => {
          if (mirrorPermissions(parent).some(p => ['writer','commenter','organizer','fileOrganizer'].includes(p.role))) throw new Error('Thư mục cha đang cấp quyền sửa/bình luận; cần xử lý riêng tại thư mục.');
        });
        mirrorPermissions(target.id).forEach(permission => {
          if (['writer','commenter'].includes(permission.role)) {
            mirrorDriveRequest(path + '/permissions/' + encodeURIComponent(permission.id), 'patch', {role:'reader'});
          } else if (!['owner','reader'].includes(permission.role)) throw new Error('Loại quyền chưa hỗ trợ; giữ nguyên và kiểm tra riêng.');
        });
        const publicPermission = mirrorPermissions(target.id).find(p => p.type === 'anyone');
        if (publicPermission) mirrorDriveRequest(path + '/permissions/' + encodeURIComponent(publicPermission.id), 'patch', {role:'reader',allowFileDiscovery:false});
        else mirrorDriveRequest(path + '/permissions', 'post', {type:'anyone',role:'reader',allowFileDiscovery:false});
        // Keep download, print and copy available. Do not lock the content: sync must still write.
        mirrorDriveRequest(path + '?fields=id,writersCanShare,copyRequiresWriterPermission', 'patch', {
          writersCanShare:false,
          downloadRestrictions:{itemDownloadRestriction:{restrictedForReaders:false,restrictedForWriters:false}}
        });
        const verified = mirrorDriveRequest(path + '?fields=id,writersCanShare,copyRequiresWriterPermission');
        const permissions = mirrorPermissions(target.id);
        if (verified.writersCanShare !== false || verified.copyRequiresWriterPermission !== false ||
            !permissions.some(p => p.type === 'anyone' && p.role === 'reader' && p.allowFileDiscovery === false) ||
            permissions.some(p => !['owner','reader'].includes(p.role))) throw new Error('Chưa xác minh đủ quyền xem và tải/in.');
        done.push(target.key);
      } catch (error) { failures.push(target.key + ': ' + error.message); }
    });
    console.log('Đã xác minh quyền xem theo link và tải/in: ' + done.join(', '));
    if (failures.length) throw new Error('Một số file chưa hoàn tất: ' + failures.join('\n'));
    return {verified:done.length,total:CONFIG.files.length};
  } finally { lock.releaseLock(); }
}
function mirrorPermissions(id) {
  const result = [];
  let page = '';
  do {
    const response = mirrorDriveRequest('/files/' + encodeURIComponent(id) + '/permissions?pageSize=100&fields=nextPageToken,permissions(id,type,role,allowFileDiscovery)' + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
    result.push.apply(result, response.permissions || []);
    page = response.nextPageToken || '';
  } while (page);
  return result;
}
function mirrorDriveRequest(path, method, payload) {
  const options = {method:method || 'get',headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()},muteHttpExceptions:true};
  if (payload) { options.contentType = 'application/json'; options.payload = JSON.stringify(payload); }
  const response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3' + path, options);
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Google Drive chưa xác nhận thay đổi. HTTP ' + code);
  const text = response.getContentText();
  return text ? JSON.parse(text) : {};
}
`;

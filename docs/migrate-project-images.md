# 迁移旧项目图片到 COS

这个脚本用于迁移服务器 SQLite 数据库中旧的 Base64 项目图片：

- `projects.thumbnail_image`
- `projects.source_image`

`users.avatar_url` 不在迁移范围内，因为当前头像业务仍允许使用 Base64。

## 运行前检查

迁移前确认服务器已经配置腾讯云 COS：

```env
TENCENT_COS_ENABLED=true
TENCENT_COS_SECRET_ID=...
TENCENT_COS_SECRET_KEY=...
TENCENT_COS_BUCKET=...
TENCENT_COS_REGION=...
TENCENT_COS_KEY_PREFIX=uploads/images
```

迁移期间先停止 API 服务，避免 API 和迁移脚本同时写 SQLite：

```bash
sudo systemctl stop qiaoqiaole-api
```

如果你的服务名不同，按实际服务名执行停止命令。

## 先预览，不修改数据

在项目目录执行：

```bash
node apps/api/scripts/migrate-project-images.mjs --dry-run
```

也可以明确指定数据库：

```bash
node apps/api/scripts/migrate-project-images.mjs \
  --db /var/lib/qiaoqiaole/qiaoqiaole.sqlite \
  --dry-run
```

预览会统计旧图片总数、原图数量、缩略图数量和预计字节数，不会连接 COS，也不会修改数据库。

## 正式迁移

确认预览结果后执行：

```bash
node apps/api/scripts/migrate-project-images.mjs --execute
```

脚本会：

1. 先在数据库目录生成 `.before-project-image-migration.*.bak` 备份；
2. 只处理 `data:image/...;base64,...`；
3. 跳过已经是 `cos://` 的记录；
4. 每张图片上传成功后才更新对应数据库字段；
5. 使用项目 ID、用户 ID 和原字段值做更新条件，避免覆盖并发修改；
6. 失败记录继续处理，并在最后返回失败数量。

可以先小批量验证：

```bash
node apps/api/scripts/migrate-project-images.mjs --execute --limit 10
```

迁移完成后重新启动 API：

```bash
sudo systemctl start qiaoqiaole-api
```

## 验证结果

可以用 SQLite 查询确认是否还有 Base64 项目图片：

```sql
SELECT
  SUM(CASE WHEN thumbnail_image LIKE 'data:image/%;base64,%' THEN 1 ELSE 0 END) AS thumbnail_base64,
  SUM(CASE WHEN source_image LIKE 'data:image/%;base64,%' THEN 1 ELSE 0 END) AS source_base64,
  SUM(CASE WHEN thumbnail_image LIKE 'cos://%' THEN 1 ELSE 0 END) AS thumbnail_cos,
  SUM(CASE WHEN source_image LIKE 'cos://%' THEN 1 ELSE 0 END) AS source_cos
FROM projects;
```

如果中途失败，重新执行即可：已经替换成 `cos://` 的记录会自动跳过。

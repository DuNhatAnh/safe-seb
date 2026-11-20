# Quy tắc commit

Theo chuẩn **Conventional Commits** (https://www.conventionalcommits.org/vi/v1.0.0/), viết tiếng Việt.

## Mẫu

```
<loại>(<phạm vi>): <mô tả ngắn>

<nội dung chi tiết - tuỳ chọn>

<chân trang - tuỳ chọn>
```

- **Mô tả ngắn**: ≤ 72 ký tự, viết thường đầu câu, không dấu chấm cuối, nói *làm gì* (vd: "sửa lỗi bấm Nộp bài không có tác dụng").
- **Nội dung chi tiết**: *vì sao* thay đổi, ảnh hưởng gì; mỗi ý một dòng bắt đầu bằng `- `.
- **Chân trang**: `BREAKING CHANGE: ...` khi là thay đổi lớn; `Closes #12` khi đóng issue.

## Loại commit

| Loại | Dùng khi | Ví dụ |
|---|---|---|
| `feat` | Thêm chức năng mới | `feat(exam): phân trang danh sách đề 3 đề / trang` |
| `fix` | Sửa lỗi | `fix(android): bật hộp thoại confirm để nộp được bài` |
| `docs` | Chỉ sửa tài liệu | `docs: thêm hướng dẫn cài app Android` |
| `style` | Định dạng code, không đổi logic | `style: căn lề lại admin.js` |
| `refactor` | Sắp xếp lại code, không đổi chức năng | `refactor(api): tách SupabaseDatabase khỏi repository` |
| `perf` | Tăng tốc độ | `perf(exam): chỉ tải trang đề đang xem` |
| `test` | Thêm / sửa test | `test(e2e): kịch bản khoá bài khi rời trang` |
| `build` | Công cụ build, thư viện | `build: nâng TypeScript lên 7.0` |
| `ci` | GitHub Actions, Vercel | `ci: đặt tên file apk kèm phiên bản` |
| `chore` | Việc lặt vặt khác | `chore: cập nhật .gitignore` |
| `revert` | Hoàn tác commit trước | `revert: feat(exam): phân trang danh sách đề` |
| `release` | Đưa ra phiên bản mới | `release: v1.1` |

## Phạm vi (tuỳ chọn) của dự án này

`exam` (trang học sinh) · `admin` · `api` (backend `lib/`) · `db` (migration) · `android` · `seb` · `lockdown` (khoá bài) · `e2e` / `test`

## Liên hệ với phiên bản (CHANGELOG.md)

| Commit trong đợt phát hành | Tăng phiên bản |
|---|---|
| Có `BREAKING CHANGE:` hoặc `feat!:` / `fix!:` (dấu `!`) | **lớn**: 1.5 → 2.0 (`npm run version:big`) |
| Có `feat` hoặc `fix` | **nhỏ**: 1.0 → 1.1 (`npm run version:small`) |
| Chỉ `docs`, `test`, `style`, `refactor`, `ci`, `chore` | không cần tăng |

## Ví dụ đầy đủ

```
fix(android): sửa lỗi bấm Nộp bài không có tác dụng

- WebView mặc định không hiện hộp thoại confirm() và tự trả "Huỷ"
- Thêm WebChromeClient để hiện hộp xác nhận nộp bài
- Cần gỡ app cũ, cài lại bản mới
```

```
feat(exam)!: bắt buộc tài khoản học sinh có mật khẩu

BREAKING CHANGE: học sinh không còn đăng nhập bằng tên tự do; admin phải tạo tài khoản trước.
```

## Lưu ý

- Mỗi commit một việc; không gộp "sửa lỗi + thêm chức năng + đổi giao diện" vào một commit.
- Không commit file bí mật (`.env`, `.env.*`, khoá, mật khẩu).
- Chạy `npm run check` trước khi push.

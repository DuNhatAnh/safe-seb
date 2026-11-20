# Lịch sử phiên bản

Phiên bản hiện tại nằm trong file [`VERSION`](VERSION), dạng **LỚN.NHỎ** (vd `1.0`, `1.1`, `2.0`).
Hiện ở cuối mọi trang ("Phiên bản 1.1 · mã commit"), trong app Android ("App v1.1"), và trong tên file tải app (`safe-exam-v1.1.apk`).

## Quy tắc đặt phiên bản

| Loại thay đổi | Cách tăng | Ví dụ |
|---|---|---|
| **Cập nhật nhỏ**: sửa lỗi, thêm / chỉnh chức năng, đổi giao diện — học sinh vẫn dùng như cũ | tăng số **sau** dấu chấm | 1.0 → 1.1 → 1.2 |
| **Cập nhật lớn**: đổi cách thi / đăng nhập, thay đổi lớn về khoá máy, bắt buộc mọi người làm lại từ đầu | tăng số **trước** dấu chấm, số sau về 0 | 1.5 → 2.0 |

- Tăng phiên bản: `npm run version:small` (nhỏ) hoặc `npm run version:big` (lớn) — tự sửa `VERSION` và thêm mục mới ở đầu file này để ghi lại thay đổi.
- Mỗi lần đưa lên (push) có thay đổi cho người dùng thì **phải tăng phiên bản**, để nhìn số là biết đang dùng bản nào.
- Có sửa app Android (thư mục `android/`) → học sinh phải **gỡ app cũ, cài lại** bản mới. Ghi rõ trong mục của phiên bản đó.

---

## 1.1

- Tên file tải app kèm phiên bản: `safe-exam-v1.1.apk`; link tải ngắn cố định **https://safe-seb.vercel.app/tai-app** (luôn trỏ tới bản mới nhất).
- Phiên bản dạng LỚN.NHỎ + quy tắc đặt phiên bản (file này). App hiện "App v1.1". Quy tắc commit: `docs/quy-tac-commit.md`.
- Lịch sử làm bài xem theo **từng đề**: nút "Lịch sử" trên thẻ đề mở hộp lịch sử (3 lần / trang, mới nhất trước); bỏ phần lịch sử ở cuối trang.
- Mỗi lần giám thị cho làm lại, **mã giám thị của đề tự đổi** (mã cũ hết hiệu lực) — xem mã mới ở nút chìa khoá bên admin.
- **App Android: cần gỡ app cũ, cài lại.**

## 1.0

- App Android: sửa lỗi bấm "Nộp bài" không có tác dụng; chỉ ghim màn hình khi bấm vào đề; nộp xong tự bỏ ghim.
- Thoát sau khi nộp không cần mã giám thị (mã chỉ cần khi thoát giữa chừng).
- Admin: công tắc "Khoá bài khi học sinh rời trang" cho từng đề (mặc định tắt).
- Danh sách đề + lịch sử làm bài phân trang 3 mục, mới nhất trước, tìm đề theo tên.
- Admin: kết quả + sự cố lọc theo ngày (mặc định hôm nay), thí sinh, mã đề; phân trang.
- Tên dài hiện đầy đủ. Hiện phiên bản ở cuối trang.

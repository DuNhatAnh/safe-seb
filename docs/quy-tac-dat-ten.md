# Quy tắc đặt tên

Tên trong code viết **tiếng Anh**; nội dung hiển thị, comment, commit, tài liệu viết **tiếng Việt**.
Code cũ đã theo các quy tắc dưới đây — không đổi tên hàng loạt, chỉ áp cho code mới hoặc khi đang sửa đúng chỗ đó.

## 1. Nhánh git — chuẩn [Conventional Branch](https://conventional-branch.github.io/)

```
<loại>/<mô-tả-ngắn>
<loại>/<số-issue>-<mô-tả-ngắn>
```

- Chữ thường, không dấu, nối bằng `-`, tối đa ~40 ký tự. Không dùng `_`, khoảng trắng, chữ hoa.
- `<loại>` trùng với loại commit trong [quy-tac-commit.md](quy-tac-commit.md):

| Loại | Dùng khi | Ví dụ |
|---|---|---|
| `feat/` | Chức năng mới | `feat/ban-phim-tu-luan-ngan` |
| `fix/` | Sửa lỗi | `fix/android-thoat-qua-thanh-dieu-huong` |
| `hotfix/` | Sửa gấp trên bản đang chạy | `hotfix/nop-bai-khong-duoc` |
| `refactor/` | Sắp xếp lại code | `refactor/tach-attempt-service` |
| `docs/` · `test/` · `chore/` · `ci/` | Như loại commit | `docs/quy-tac-dat-ten` |
| `release/` | Chuẩn bị phát hành | `release/v1.5` |

- `main` là bản chạy thật (Vercel production). Không commit thẳng vào `main`; làm trên nhánh → Vercel tạo link preview → test → gộp vào `main`.
- Gộp xong thì xoá nhánh.

## 2. Tên file

| Loại file | Quy tắc | Ví dụ |
|---|---|---|
| TS chứa class (`lib/`) | `PascalCase.ts`, trùng tên class | `AttemptService.ts`, `ExamRepository.ts` |
| TS chứa hàm tiện ích | `camelCase.ts` | `examPassword.ts`, `secureCompare.ts` |
| JS trình duyệt (`public/js/`) | `kebab-case.js` | `question-types.js`, `lockdown.js` |
| HTML, CSS, ảnh | `kebab-case` | `seb-quit.html`, `logo.svg` |
| Kotlin (`android/`) | `PascalCase.kt`, trùng tên class | `KioskManager.kt` |
| Tài nguyên Android (`res/`) | `snake_case` (Android bắt buộc) | `ic_launcher_foreground.xml` |
| Migration | `NNNN_<bảng>_<việc>.sql`, số tăng dần 4 chữ số | `0012_exam_results_add_score.sql` |
| Unit test | `<module>.test.ts` | `services.test.ts` |
| E2E test | `<luồng>.spec.ts` | `entry-password.spec.ts` |
| Tài liệu (`docs/`) | `kebab-case` tiếng Việt không dấu | `quy-tac-commit.md` |

Hậu tố theo tầng trong `lib/`: `...Controller`, `...Service`, `...Repository`, `...Database`.

## 3. Tên trong code TypeScript / JavaScript

Theo [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html#identifiers):

| Thứ | Quy tắc | Ví dụ |
|---|---|---|
| Biến, hàm, tham số, thuộc tính | `camelCase` | `currentExam`, `loadExams()` |
| Class, interface, type, enum | `PascalCase` | `GradingService`, `ExamRow` |
| Hằng số cấp module, giá trị cố định | `UPPER_SNAKE_CASE` | `FREE_RETAKE_ATTEMPTS`, `TOKEN_TTL_MS` |
| Boolean | bắt đầu `is/has/can/should` | `isLocked`, `hasPassword`, `canRetake` |
| Hàm | động từ đứng đầu | `submitAttempt()`, `verifyPassword()` |
| Hàm xử lý sự kiện (UI) | `on` + sự kiện / `handle` + việc | `onSubmitClick`, `handleExit` |
| Đơn vị đo | ghi vào tên | `durationMinutes`, `CACHE_MS`, `remainingSeconds` |

- Không viết tắt khó hiểu (`ex`, `tmp2`, `d`); được dùng tắt phổ biến: `id`, `url`, `db`, `api`.
- Tên dài mà rõ tốt hơn tên ngắn mà phải đọc code mới hiểu.

## 4. Kotlin (Android)

Theo [Kotlin Coding Conventions](https://kotlinlang.org/docs/coding-conventions.html#naming-rules): class `PascalCase`, hàm/biến `camelCase`,
hằng `const val UPPER_SNAKE_CASE`, package chữ thường (`com.safe.exam`). View id trong layout: `snake_case` (`web_view`).

## 5. Database (Postgres / Supabase)

| Thứ | Quy tắc | Ví dụ |
|---|---|---|
| Bảng | `snake_case`, số nhiều | `exams`, `exam_results`, `app_versions` |
| Cột | `snake_case`, số ít | `student_name`, `duration_minutes` |
| Khoá ngoại | `<bảng số ít>_id` | `exam_id` |
| Thời gian | hậu tố `_at` | `created_at`, `submitted_at` |
| Boolean | động từ/tính từ rõ nghĩa: `allow_/require_/lock_/is_` | `allow_retake`, `require_password`, `lock_on_leave` |
| Index | `<bảng>_<cột>_idx` | `exam_results_exam_student_idx`, `exams_created_at_idx` |
| Giá trị loại sự kiện | `UPPER_SNAKE_CASE` tiếng Việt không dấu (giữ như hiện có) | `THOAT_KHAN_CAP`, `SAI_MAT_KHAU` |

API JSON trả ra trình duyệt: giữ nguyên `snake_case` như cột DB, không trộn hai kiểu trong cùng một đối tượng.

## 6. CSS / HTML

- Class và id: `kebab-case` (`admin-layout`, `sidebar-item`).
- Thành phần con / trạng thái: `khoi-con` và `is-<trạng thái>` (`modal-footer`, `is-active`, `is-hidden`).
- Không đặt tên theo màu hay vị trí (`.red-btn`, `.left-box`) — đặt theo vai trò (`.btn-danger`, `.sidebar`).

## 7. Phiên bản & tag

Phiên bản `vX.Y` (xem [quy-tac-commit.md](quy-tac-commit.md)); file APK `safe-exam-vX.Y.apk`; tag git `vX.Y`.

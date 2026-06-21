;;; pi-emacs-context.el --- Export Emacs editor context for pi -*- lexical-binding: t; -*-

(require 'cl-lib)
(require 'json)

(defun pi-emacs--maybe-persp ()
  (when (and (featurep 'persp-mode) (fboundp 'get-current-persp))
    (get-current-persp)))

(defun pi-emacs--current-persp-name ()
  (let ((persp (pi-emacs--maybe-persp)))
    (when (and persp (fboundp 'persp-name))
      (persp-name persp))))

(defun pi-emacs--persp-buffers (persp)
  (cond
   ((and persp (fboundp 'persp-buffers)) (persp-buffers persp))
   ((and persp (fboundp 'persp-buffer-list)) (persp-buffer-list persp))
   ((and persp (fboundp 'persp-current-buffers)) (persp-current-buffers persp))
   (t nil)))

(defun pi-emacs--candidate-buffers ()
  (or (pi-emacs--persp-buffers (pi-emacs--maybe-persp))
      (buffer-list)))

(defun pi-emacs--buffer-with-active-region ()
  (cl-find-if (lambda (buf)
                (with-current-buffer buf
                  (use-region-p)))
              (pi-emacs--candidate-buffers)))

(defun pi-emacs--project-root ()
  (when (and (fboundp 'project-current) (fboundp 'project-root))
    (let ((project (project-current nil)))
      (when project
        (project-root project)))))

(defun pi-emacs--selection ()
  (when (use-region-p)
    (let* ((start (region-beginning))
           (end (region-end))
           (start-line (line-number-at-pos start))
           (end-line (line-number-at-pos end))
           (start-column (save-excursion (goto-char start) (current-column)))
           (end-column (save-excursion (goto-char end) (current-column))))
      `((text . ,(buffer-substring-no-properties start end))
        (start . ((line . ,start-line) (column . ,start-column)))
        (end . ((line . ,end-line) (column . ,end-column)))))))

(defun pi-emacs--buffer-info (buffer active-buffer)
  (with-current-buffer buffer
    (let ((file (buffer-file-name buffer)))
      `((name . ,(buffer-name buffer))
        (file . ,(when file (expand-file-name file)))
        (mode . ,(symbol-name major-mode))
        (modified . ,(if (buffer-modified-p) t :json-false))
        (active . ,(if (eq buffer active-buffer) t :json-false))))))

(defun pi-emacs--buffer-list (active-buffer)
  (let* ((buffers (pi-emacs--candidate-buffers))
         (filtered (cl-remove-if-not (lambda (buf)
                                       (or (buffer-file-name buf)
                                           (eq buf active-buffer)))
                                     buffers)))
    (mapcar (lambda (buf) (pi-emacs--buffer-info buf active-buffer)) filtered)))

(defun pi-emacs-context ()
  (let* ((active-window (selected-window))
         (window-buffer (window-buffer active-window))
         (active-buffer (or (pi-emacs--buffer-with-active-region) window-buffer)))
    (with-current-buffer active-buffer
      (let* ((cursor-pos (if (eq active-buffer window-buffer)
                             (window-point active-window)
                           (point)))
             (cursor-line (line-number-at-pos cursor-pos))
             (cursor-column (save-excursion (goto-char cursor-pos) (current-column)))
             (selection (pi-emacs--selection))
             (persp-name (pi-emacs--current-persp-name))
             (project-root (pi-emacs--project-root))
             (buffers (vconcat (pi-emacs--buffer-list active-buffer))))
        (json-serialize
         `((buffer . ,(pi-emacs--buffer-info active-buffer active-buffer))
           (cursor . ((line . ,cursor-line) (column . ,cursor-column)))
           (selection . ,selection)
           (persp . ,(when persp-name `((name . ,persp-name))))
           (project . ,(when project-root `((root . ,project-root))))
           (buffers . ,buffers))
         :false-object :json-false)))))

(defun pi-emacs-context-to-file (path)
  (with-temp-file (expand-file-name path)
    (insert (pi-emacs-context))))

(provide 'pi-emacs-context)

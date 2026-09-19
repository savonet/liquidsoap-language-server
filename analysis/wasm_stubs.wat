(module
   ;; Base asks whether inline tests are running; they never are here.
   (func (export "Base_am_testing") (param (ref eq)) (result (ref eq))
      (ref.i31 (i32.const 0)))

   ;; The threads library initializes at startup. The analysis is single
   ;; threaded, so this matches liquidsoap's js_of_ocaml stubs.
   (func (export "caml_thread_initialize") (param (ref eq)) (result (ref eq))
      (ref.i31 (i32.const 0)))
   (func (export "caml_thread_cleanup") (param (ref eq)) (result (ref eq))
      (ref.i31 (i32.const 0)))
   (func (export "caml_thread_self") (param (ref eq)) (result (ref eq))
      (ref.i31 (i32.const 0)))
   (func (export "caml_thread_id") (param (ref eq)) (result (ref eq))
      (ref.i31 (i32.const 0)))
   (func (export "caml_thread_yield") (param (ref eq)) (result (ref eq))
      (ref.i31 (i32.const 0)))
   (func (export "caml_set_current_thread_name")
      (param (ref eq)) (result (ref eq))
      (ref.i31 (i32.const 0))))

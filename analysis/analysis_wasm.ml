open Js_of_ocaml
module Analysis = Liquidsoap_tooling.Analysis

let env = ref None
let last_result = ref None

let load_env dump =
  env :=
    Some
      (Analysis.load_env ~version:Liquidsoap_lang_data.Build_config.version
         (Typed_array.String.of_uint8Array dump))

let diagnostic_to_js { Analysis.severity; code; pos; message } =
  let line, column =
    match pos with
      | Some pos ->
          let { Liquidsoap_lang_prelude.Pos.lstart; cstart; _ } =
            Liquidsoap_lang_prelude.Pos.unpack pos
          in
          (lstart, cstart)
      | None -> (0, 0)
  in
  object%js
    val severity =
      Js.string (match severity with `Error -> "error" | `Warning -> "warning")

    val code = code
    val line = line
    val column = column
    val message = Js.string message
  end

let check source =
  match !env with
    | None -> failwith "loadEnv must be called first"
    | Some env ->
        let result = Analysis.check ~env (Js.to_string source) in
        last_result := Some result;
        Js.array (Array.of_list (List.map diagnostic_to_js result.diagnostics))

let type_at line column =
  match !last_result with
    | None -> Js.null
    | Some result -> (
        match Analysis.type_at result ~line ~column with
          | Some typ -> Js.some (Js.string typ)
          | None -> Js.null)

let () =
  Js.export "liquidsoap"
    (object%js
       method loadEnv dump = load_env dump
       method check source = check source
       method typeAt line column = type_at line column
    end)

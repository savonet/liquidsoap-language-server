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
  let { Liquidsoap_lang_prelude.Pos.fname; lstart; cstart; lstop; cstop } =
    match pos with
      | Some pos -> Liquidsoap_lang_prelude.Pos.unpack pos
      | None -> { fname = ""; lstart = 1; cstart = 0; lstop = 1; cstop = 0 }
  in
  object%js
    val severity =
      Js.string (match severity with `Error -> "error" | `Warning -> "warning")

    val code = code
    val file = Js.string fname
    val startLine = lstart
    val startColumn = cstart
    val endLine = lstop
    val endColumn = cstop
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

let locals_at line column =
  match !last_result with
    | None -> Js.array [||]
    | Some result ->
        Js.array
          (Array.of_list
             (List.map Js.string (Analysis.locals_at result ~line ~column)))

let () =
  Js.export "liquidsoap"
    (object%js
       method loadEnv dump = load_env dump
       method check source = check source
       method typeAt line column = type_at line column
       method localsAt line column = locals_at line column
    end)

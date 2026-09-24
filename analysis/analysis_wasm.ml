open Js_of_ocaml
module Analysis = Liquidsoap_tooling.Analysis

let env = ref None
let last_result = ref None

let load_env dump =
  match Analysis.load_env (Typed_array.String.of_uint8Array dump) with
    | loaded -> env := Some loaded
    | exception Failure message ->
        Js.Js_error.raise_
          (Js.Js_error.of_error (new%js Js.error_constr (Js.string message)))

let diagnostic_to_js { Analysis.severity; code; pos; message } =
  let { Liquidsoap_lang_prelude.Pos.fname; lstart; cstart; lstop; cstop } =
    match pos with
      | Some pos -> Liquidsoap_lang_prelude.Pos.unpack pos
      | None -> { fname = ""; lstart = 1; cstart = 0; lstop = 1; cstop = 0 }
  in
  object%js
    val severity =
      Js.string
        (match severity with `Error -> "error" | `Warning -> "warning")

    val code = code
    val file = Js.string fname
    val startLine = lstart
    val startColumn = cstart
    val endLine = lstop
    val endColumn = cstop
    val message = Js.string message
  end

let check source file =
  match !env with
    | None -> failwith "loadEnv must be called first"
    | Some env ->
        let result =
          Analysis.check ~file:(Js.to_string file) ~env (Js.to_string source)
        in
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

let scope_at line column =
  match (!env, !last_result) with
    | Some env, Some result ->
        Js.array
          (Array.of_list
             (List.map Js.string (Analysis.scope_at ~env result ~line ~column)))
    | _ -> Js.array [||]

let methods_to_js methods =
  Js.array
    (Array.of_list
       (List.map
          (fun (name, typ) ->
            object%js
              val name = Js.string name
              val type_ = Js.string typ
            end)
          methods))

let methods_at line column =
  match !last_result with
    | None -> Js.array [||]
    | Some result -> methods_to_js (Analysis.methods_at result ~line ~column)

let definition_at line column =
  match !last_result with
    | None -> Js.null
    | Some result -> (
        match Analysis.definition_at result ~line ~column with
          | None -> Js.null
          | Some pos ->
              let {
                Liquidsoap_lang_prelude.Pos.fname;
                lstart;
                cstart;
                lstop;
                cstop;
              } =
                Liquidsoap_lang_prelude.Pos.unpack pos
              in
              Js.some
                (object%js
                   val file = Js.string fname
                   val startLine = lstart
                   val startColumn = cstart
                   val endLine = lstop
                   val endColumn = cstop
                end))

let null_methods () =
  match !env with
    | None -> Js.array [||]
    | Some env -> methods_to_js (Analysis.null_methods ~env)

let () =
  Js.export "liquidsoap"
    (object%js
       method loadEnv dump = load_env dump
       method check source file = check source file
       method typeAt line column = type_at line column
       method localsAt line column = locals_at line column
       method scopeAt line column = scope_at line column
       method methodsAt line column = methods_at line column
       method definitionAt line column = definition_at line column
       method nullMethods = null_methods ()
    end)

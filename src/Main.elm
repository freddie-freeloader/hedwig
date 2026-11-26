port module Main exposing (main)

import Browser
import Html exposing (Html, button, div, h1, h2, h3, header, input, label, p, span, summary, details, textarea, text)
import Html.Attributes exposing (class, placeholder, rows, type_, value)
import Html.Events exposing (onClick, onInput)
import Json.Decode as D
import Json.Encode as E


port themeChanged : String -> Cmd msg
port initializeIdentity : E.Value -> Cmd msg
port identityLoaded : (E.Value -> msg) -> Sub msg
port createOffer : () -> Cmd msg
port offerCreated : (E.Value -> msg) -> Sub msg
port acceptOffer : String -> Cmd msg
port answerCreated : (E.Value -> msg) -> Sub msg
port setRemoteAnswer : String -> Cmd msg
port connectionStatus : (E.Value -> msg) -> Sub msg
port prepareEnvelope : E.Value -> Cmd msg
port envelopeSent : (E.Value -> msg) -> Sub msg
port envelopeReceived : (E.Value -> msg) -> Sub msg
port decryptEnvelope : String -> Cmd msg
port letterDecrypted : (E.Value -> msg) -> Sub msg
port bridgeError : (E.Value -> msg) -> Sub msg
port copyText : String -> Cmd msg
port debugLog : (E.Value -> msg) -> Sub msg
port saveDraft : E.Value -> Cmd msg
port saveContact : E.Value -> Cmd msg
port deleteContact : String -> Cmd msg
port stateLoaded : (E.Value -> msg) -> Sub msg
port exportIdentity : () -> Cmd msg
port identityExported : (E.Value -> msg) -> Sub msg
port importIdentity : String -> Cmd msg
port downloadIdentity : String -> Cmd msg
port importIdentityFile : () -> Cmd msg
port identityFileLoaded : (E.Value -> msg) -> Sub msg
port archiveOutbox : () -> Cmd msg
port archiveSent : () -> Cmd msg
port restoreOutbox : String -> Cmd msg
port deleteArchivedOutbox : String -> Cmd msg
port restoreSent : String -> Cmd msg
port deleteArchivedSent : String -> Cmd msg
port resetConnection : () -> Cmd msg
port retryEnvelope : String -> Cmd msg
port outboxUpdated : (E.Value -> msg) -> Sub msg


type alias Flags =
    { location : String
    , theme : String
    }


type alias Letter =
    { id : String
    , from : String
    , subject : String
    , body : String
    , releaseRound : Int
    , sentAt : String
    , receivedAt : String
    }


type alias SentLetter =
    { id : String
    , to : String
    , subject : String
    , body : String
    , releaseRound : Int
    , sentAt : String
    , status : String
    , sentAtLocal : String
    }


type alias OutboxItem =
    { id : String
    , subject : String
    , recipient : String
    , recipientName : String
    , status : String
    , envelope : String
    , createdAt : String
    , error : String
    }


type alias Model =
    { location : String
    , page : Page
    , theme : String
    , name : String
    , address : String
    , recipient : String
    , subject : String
    , body : String
    , releaseHours : String
    , releaseSeconds : String
    , invitation : String
    , answer : String
    , connectionStatus : String
    , iceDetails : String
    , notice : String
    , sentEnvelope : String
    , inbox : List Letter
    , draftEnvelope : String
    , debugLogs : List String
    , contacts : List Contact
    , drafts : List Draft
    , sealedEnvelopes : List String
    , identityBackup : String
    , importBackup : String
    , outbox : List OutboxItem
    , sent : List SentLetter
    , archivedOutbox : List OutboxItem
    , archivedSent : List SentLetter
    , confirmation : Maybe String
    }


type alias Contact =
    { name : String
    , address : String
    }


type alias Draft =
    { recipient : String
    , subject : String
    , body : String
    , releaseHours : String
    , releaseSeconds : String
    }


type Page
    = Desk
    | Owl
    | Compose
    | Inbox
    | Outbox
    | Sent
    | Help


type Msg
    = ToggleTheme
    | ShowDesk
    | ShowOwl
    | ShowCompose
    | ShowInbox
    | ShowOutbox
    | ShowSent
    | ShowHelp
    | CopyAddress
    | CopyInvitation
    | CopyAnswer
    | CopyBackup
    | NameChanged String
    | SaveIdentity
    | IdentityResult D.Value
    | RecipientChanged String
    | SubjectChanged String
    | BodyChanged String
    | ReleaseHoursChanged String
    | ReleaseSecondsChanged String
    | InvitationChanged String
    | AnswerChanged String
    | CreateOffer
    | OfferResult D.Value
    | AcceptOffer
    | AnswerResult D.Value
    | SetRemoteAnswer
    | ConnectionResult D.Value
    | PrepareEnvelope
    | EnvelopeSentResult D.Value
    | EnvelopeReceivedResult D.Value
    | DecryptLetter String
    | LetterDecryptedResult D.Value
    | BridgeErrorResult D.Value
    | DebugLogResult D.Value
    | ClearDebugLog
    | RetryEnvelope String
    | StateLoadedResult D.Value
    | ExportIdentity
    | IdentityExportedResult D.Value
    | ImportIdentityChanged String
    | ImportIdentity
    | DownloadIdentity
    | ImportIdentityFile
    | IdentityFileLoadedResult D.Value
    | ArchiveOutbox
    | ArchiveSent
    | RestoreOutbox String
    | DeleteArchivedOutbox String
    | RestoreSent String
    | DeleteArchivedSent String
    | RequestIdentityRestore
    | RequestOutboxArchive
    | RequestSentArchive
    | CancelConfirmation
    | ConfirmAction
    | ResetConnection
    | SaveDraft
    | AddRecipientContact
    | SelectRecipient String


main : Program Flags Model Msg
main =
    Browser.element
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


init : Flags -> ( Model, Cmd Msg )
init flags =
    ( { location = flags.location
      , page =
            if String.contains "#help" flags.location then Help
            else if String.contains "#outbox" flags.location then Outbox
            else if String.contains "#sent" flags.location then Sent
            else if String.contains "#compose" flags.location then Compose
            else if String.contains "#inbox" flags.location then Inbox
            else if String.contains "#owl" flags.location then Owl
            else Desk
      , theme = if flags.theme == "light" then "light" else "dark"
      , name = ""
      , address = ""
      , recipient = ""
      , subject = ""
      , body = ""
      , releaseHours = "24"
      , releaseSeconds = "0"
      , invitation = ""
      , answer = ""
      , connectionStatus = "Disconnected"
      , iceDetails = ""
      , notice = ""
      , sentEnvelope = ""
      , inbox = []
      , draftEnvelope = ""
      , debugLogs = []
      , contacts = []
      , drafts = []
      , sealedEnvelopes = []
      , identityBackup = ""
      , importBackup = ""
      , outbox = []
      , sent = []
      , archivedOutbox = []
      , archivedSent = []
      , confirmation = Nothing
      }
    , initializeIdentity (E.object [ ( "name", E.string "" ) ])
    )


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.batch
        [ identityLoaded IdentityResult
        , offerCreated OfferResult
        , answerCreated AnswerResult
        , connectionStatus ConnectionResult
        , envelopeSent EnvelopeSentResult
        , envelopeReceived EnvelopeReceivedResult
        , letterDecrypted LetterDecryptedResult
        , bridgeError BridgeErrorResult
        , debugLog DebugLogResult
        , stateLoaded StateLoadedResult
        , identityExported IdentityExportedResult
        , outboxUpdated StateLoadedResult
        , identityFileLoaded IdentityFileLoadedResult
        ]


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        ToggleTheme ->
            let
                nextTheme =
                    if model.theme == "dark" then "light" else "dark"
            in
            ( { model | theme = nextTheme }, themeChanged nextTheme )

        ShowDesk ->
            ( { model | page = Desk }, Cmd.none )

        ShowOwl ->
            ( { model | page = Owl }, Cmd.none )

        ShowCompose ->
            ( { model | page = Compose }, Cmd.none )

        ShowInbox ->
            ( { model | page = Inbox }, Cmd.none )

        ShowOutbox ->
            ( { model | page = Outbox }, Cmd.none )

        ShowSent ->
            ( { model | page = Sent }, Cmd.none )

        ShowHelp ->
            ( { model | page = Help }, Cmd.none )

        CopyAddress ->
            ( { model | notice = "Owl address copied" }, copyText model.address )

        CopyInvitation ->
            ( { model | notice = "Invitation copied" }, copyText model.invitation )

        CopyAnswer ->
            ( { model | notice = "Answer copied" }, copyText model.answer )

        CopyBackup ->
            ( { model | notice = "Identity backup copied" }, copyText model.identityBackup )

        NameChanged value ->
            ( { model | name = value }, Cmd.none )

        SaveIdentity ->
            ( model
            , initializeIdentity (E.object [ ( "name", E.string model.name ) ])
            )

        IdentityResult value ->
            let
                decoder =
                    D.map2 Tuple.pair
                        (D.field "address" D.string)
                        (D.field "name" D.string)
            in
            case D.decodeValue decoder value of
                Ok ( address, name ) ->
                    ( { model | address = address, name = name, notice = "Identity ready" }
                    , Cmd.none
                    )
                Err _ ->
                    ( model, Cmd.none )

        RecipientChanged value ->
            ( { model | recipient = value }, Cmd.none )

        SubjectChanged value ->
            ( { model | subject = value }, Cmd.none )

        BodyChanged value ->
            ( { model | body = value }, Cmd.none )

        ReleaseHoursChanged value ->
            ( { model | releaseHours = value, releaseSeconds = "0" }, Cmd.none )

        ReleaseSecondsChanged value ->
            ( { model | releaseHours = "0", releaseSeconds = value }, Cmd.none )

        InvitationChanged value ->
            ( { model | invitation = value }, Cmd.none )

        AnswerChanged value ->
            ( { model | answer = value }, Cmd.none )

        CreateOffer ->
            ( model, createOffer () )

        OfferResult value ->
            case D.decodeValue (D.field "sdp" D.string) value of
                Ok sdp ->
                    ( { model | invitation = sdp, connectionStatus = "Invitation ready" }, Cmd.none )
                Err _ ->
                    ( model, Cmd.none )

        AcceptOffer ->
            ( model, acceptOffer model.invitation )

        AnswerResult value ->
            case D.decodeValue (D.field "sdp" D.string) value of
                Ok sdp ->
                    ( { model | answer = sdp, connectionStatus = "Answer ready" }, Cmd.none )
                Err _ ->
                    ( model, Cmd.none )

        SetRemoteAnswer ->
            ( model, setRemoteAnswer model.answer )

        ConnectionResult value ->
            let
                decoder =
                    D.map2 Tuple.pair
                        (D.field "status" D.string)
                        (D.oneOf
                            [ D.field "detail" D.string
                            , D.succeed ""
                            ]
                        )
            in
            case D.decodeValue decoder value of
                Ok ( status, detail ) ->
                    ( { model | connectionStatus = status, iceDetails = detail }, Cmd.none )
                Err _ ->
                    ( model, Cmd.none )

        PrepareEnvelope ->
            let
                releaseHours =
                    model.releaseHours
                        |> String.toFloat
                        |> Maybe.withDefault 24
                        |> max 0
                releaseSeconds =
                    model.releaseSeconds
                        |> String.toFloat
                        |> Maybe.withDefault 0
                        |> max 0
            in
            ( { model | notice = "Preparing TLock envelope..." }
            , prepareEnvelope
                (E.object
                    [ ( "recipient", E.string model.recipient )
                    , ( "subject", E.string model.subject )
                    , ( "body", E.string model.body )
                    , ( "releaseHours", E.float releaseHours )
                    , ( "releaseSeconds", E.float releaseSeconds )
                    ]
                )
            )

        EnvelopeSentResult value ->
            case D.decodeValue
                (D.map2 Tuple.pair
                    (D.field "envelope" D.string)
                    (D.maybe (D.field "confirmed" D.bool))
                )
                value
            of
                Ok ( envelope, confirmed ) ->
                    ( { model
                        | sentEnvelope = envelope
                        , notice =
                            if confirmed == Just True then
                                "Send confirmed: peer received the letter"
                            else
                                "Envelope handed to the peer connection"
                      }
                    , Cmd.none
                    )
                Err _ ->
                    ( model, Cmd.none )

        EnvelopeReceivedResult value ->
            let
                envelopeDecoder =
                    D.map2 Tuple.pair
                        (D.field "envelope" D.string)
                        (D.field "releaseRound" D.int)
            in
            case D.decodeValue envelopeDecoder value of
                Ok ( envelope, releaseRound ) ->
                    ( { model
                        | draftEnvelope = envelope
                        , notice = "Envelope received; release round " ++ String.fromInt releaseRound
                      }
                    , Cmd.none
                    )
                Err _ ->
                    ( model, Cmd.none )

        DecryptLetter envelope ->
            ( model, decryptEnvelope envelope )

        LetterDecryptedResult value ->
            let
                letterDecoder =
                    D.map7 Letter
                        (D.field "id" D.string)
                        (D.field "from" D.string)
                        (D.field "subject" D.string)
                        (D.field "body" D.string)
                        (D.field "releaseRound" D.int)
                        (D.field "sentAt" D.string)
                        (D.oneOf
                            [ D.field "receivedAt" D.string
                            , D.succeed ""
                            ]
                        )
            in
            case D.decodeValue letterDecoder value of
                Ok letter ->
                    ( { model | inbox = letter :: model.inbox, draftEnvelope = "", notice = "Letter opened" }
                    , Cmd.none
                    )
                Err _ ->
                    ( model, Cmd.none )

        BridgeErrorResult value ->
            case D.decodeValue (D.field "message" D.string) value of
                Ok message ->
                    ( { model | notice = message }, Cmd.none )
                Err _ ->
                    ( model, Cmd.none )

        DebugLogResult value ->
            case D.decodeValue
                (D.map2 Tuple.pair
                    (D.field "time" D.string)
                    (D.field "message" D.string)
                )
                value
            of
                Ok ( time, message ) ->
                    ( { model | debugLogs = (time ++ "  " ++ message) :: model.debugLogs |> List.take 50 }
                    , Cmd.none
                    )
                Err _ ->
                    ( model, Cmd.none )

        ClearDebugLog ->
            ( { model | debugLogs = [] }, Cmd.none )

        RetryEnvelope envelopeId ->
            ( model, retryEnvelope envelopeId )

        SaveDraft ->
            ( model
            , saveDraft
                (E.object
                    [ ( "recipient", E.string model.recipient )
                    , ( "subject", E.string model.subject )
                    , ( "body", E.string model.body )
                    , ( "releaseHours", E.string model.releaseHours )
                    , ( "releaseSeconds", E.string model.releaseSeconds )
                    ]
                )
            )

        AddRecipientContact ->
            ( model
            , saveContact
                (E.object
                    [ ( "name", E.string "Recipient" )
                    , ( "address", E.string model.recipient )
                    ]
                )
            )

        SelectRecipient address ->
            ( { model | recipient = address }, Cmd.none )

        ExportIdentity ->
            ( model, exportIdentity () )

        IdentityExportedResult value ->
            case D.decodeValue (D.field "backup" D.string) value of
                Ok backup ->
                    ( { model | identityBackup = backup, notice = "Identity backup ready" }, Cmd.none )
                Err _ ->
                    ( model, Cmd.none )

        ImportIdentityChanged value ->
            ( { model | importBackup = value }, Cmd.none )

        ImportIdentity ->
            if model.importBackup == "" then
                ( { model | notice = "Paste an identity backup first" }, Cmd.none )
            else
                ( { model | confirmation = Just "restore-identity" }, Cmd.none )

        RequestIdentityRestore ->
            ( { model | confirmation = Just "restore-identity" }, Cmd.none )

        RequestOutboxArchive ->
            ( { model | confirmation = Just "archive-outbox" }, Cmd.none )

        RequestSentArchive ->
            ( { model | confirmation = Just "archive-sent" }, Cmd.none )

        CancelConfirmation ->
            ( { model | confirmation = Nothing }, Cmd.none )

        ConfirmAction ->
            case model.confirmation of
                Just "restore-identity" ->
                    ( { model | confirmation = Nothing }, importIdentity model.importBackup )

                Just "archive-outbox" ->
                    ( { model | confirmation = Nothing }, archiveOutbox () )

                Just "archive-sent" ->
                    ( { model | confirmation = Nothing }, archiveSent () )

                _ ->
                    ( { model | confirmation = Nothing }, Cmd.none )

        DownloadIdentity ->
            ( model, downloadIdentity model.identityBackup )

        ImportIdentityFile ->
            ( model, importIdentityFile () )

        IdentityFileLoadedResult value ->
            case D.decodeValue (D.field "backup" D.string) value of
                Ok backup ->
                    ( { model | importBackup = backup, notice = "Identity file loaded; restore it only if it belongs to this owl" }
                    , Cmd.none
                    )
                Err _ ->
                    ( { model | notice = "Identity file could not be read" }, Cmd.none )

        ArchiveOutbox ->
            ( model, archiveOutbox () )

        ArchiveSent ->
            ( model, archiveSent () )

        RestoreOutbox id ->
            ( model, restoreOutbox id )

        DeleteArchivedOutbox id ->
            ( model, deleteArchivedOutbox id )

        RestoreSent id ->
            ( model, restoreSent id )

        DeleteArchivedSent id ->
            ( model, deleteArchivedSent id )

        ResetConnection ->
            ( { model
                | invitation = ""
                , answer = ""
                , connectionStatus = "Disconnected"
                , notice = "Connection reset"
              }
            , resetConnection ()
            )

        StateLoadedResult value ->
            let
                contactDecoder =
                    D.map2 Contact
                        (D.field "name" D.string)
                        (D.field "address" D.string)
                draftDecoder =
                    D.map5 Draft
                        (D.field "recipient" D.string)
                        (D.field "subject" D.string)
                        (D.field "body" D.string)
                        (D.field "releaseHours" D.string)
                        (D.field "releaseSeconds" D.string)
                outboxDecoder =
                    D.map8 OutboxItem
                        (D.field "id" D.string)
                        (D.field "subject" D.string)
                        (D.oneOf [ D.field "recipient" D.string, D.succeed "" ])
                        (D.oneOf [ D.field "recipientName" D.string, D.succeed "" ])
                        (D.field "status" D.string)
                        (D.field "envelope" D.string)
                        (D.field "createdAt" D.string)
                        (D.field "error" D.string)
                sentDecoder =
                    D.map8 SentLetter
                        (D.field "id" D.string)
                        (D.field "to" D.string)
                        (D.field "subject" D.string)
                        (D.field "body" D.string)
                        (D.field "releaseRound" D.int)
                        (D.field "sentAt" D.string)
                        (D.field "status" D.string)
                        (D.oneOf
                            [ D.field "sentAtLocal" D.string
                            , D.succeed ""
                            ]
                        )
                decoder =
                    D.map8
                        (\contacts drafts sealed inbox outbox sent archivedOutbox archivedSent ->
                            { contacts = contacts
                            , drafts = drafts
                            , sealed = sealed
                            , inbox = inbox
                            , outbox = outbox
                            , sent = sent
                            , archivedOutbox = archivedOutbox
                            , archivedSent = archivedSent
                            })
                        (D.field "contacts" (D.list contactDecoder))
                        (D.field "drafts" (D.list draftDecoder))
                        (D.field "sealed" (D.list D.string))
                        (D.field "opened"
                            (D.list
                                (D.map7 Letter
                                    (D.field "id" D.string)
                                    (D.field "from" D.string)
                                    (D.field "subject" D.string)
                                    (D.field "body" D.string)
                                    (D.field "releaseRound" D.int)
                                    (D.field "sentAt" D.string)
                                    (D.oneOf
                                        [ D.field "receivedAt" D.string
                                        , D.succeed ""
                                        ]
                                    )
                                )
                            )
                        )
                        (D.field "outbox" (D.list outboxDecoder))
                        (D.field "sent" (D.list sentDecoder))
                        (D.field "archivedOutbox" (D.list outboxDecoder))
                        (D.field "archivedSent" (D.list sentDecoder))
            in
            case D.decodeValue decoder value of
                Ok state ->
                    let
                        firstDraft =
                            List.head state.drafts
                        restored =
                            Maybe.map
                                (\draft ->
                                    { model
                                        | recipient = draft.recipient
                                        , subject = draft.subject
                                        , body = draft.body
                                        , releaseHours = draft.releaseHours
                                        , releaseSeconds = draft.releaseSeconds
                                    }
                                )
                                firstDraft
                                |> Maybe.withDefault model
                    in
                    ( { restored
                        | contacts = state.contacts
                        , drafts = state.drafts
                        , sealedEnvelopes = state.sealed
                        , inbox = state.inbox
                        , outbox = state.outbox
                        , sent = state.sent
                        , archivedOutbox = state.archivedOutbox
                        , archivedSent = state.archivedSent
                        , draftEnvelope =
                            case List.head state.sealed of
                                Just envelope ->
                                    envelope
                                Nothing ->
                                    ""
                        , notice = "Saved state restored"
                      }
                    , Cmd.none
                    )
                Err _ ->
                    ( model, Cmd.none )


view : Model -> Html Msg
view model =
    div [ class "mx-auto min-h-screen max-w-6xl px-4 pb-12 pt-5 md:px-8" ]
        [ header [ class "mb-6 flex items-center justify-between border-b border-line pb-4" ]
            [ button
                [ class "text-left"
                , onClick ShowDesk
                ]
                [ span [ class "block text-xs font-semibold uppercase tracking-[0.24em] text-gold" ] [ text "Hedwig" ]
                , h1 [ class "mt-1 font-serif text-3xl text-ink" ] [ text "Private letter desk" ]
                ]
            , div [ class "flex items-center gap-2" ]
                [ button
                    [ class "rounded-full border border-line px-3 py-2 text-sm text-ink-soft"
                    , onClick ShowDesk
                    ]
                    [ text "Desk" ]
                , button
                    [ class "rounded-full border border-line px-3 py-2 text-sm text-ink-soft"
                    , onClick ShowOwl
                    ]
                    [ text "Owl" ]
                , button
                    [ class "rounded-full border border-line px-3 py-2 text-sm text-ink-soft"
                    , onClick ShowCompose
                    ]
                    [ text "Compose" ]
                , button
                    [ class "rounded-full border border-line px-3 py-2 text-sm text-ink-soft"
                    , onClick ShowInbox
                    ]
                    [ text ("Inbox (" ++ String.fromInt (List.length model.inbox + (if model.draftEnvelope == "" then 0 else 1)) ++ ")") ]
                , button
                    [ class "rounded-full border border-line px-3 py-2 text-sm text-ink-soft"
                    , onClick ShowOutbox
                    ]
                    [ text ("Outbox (" ++ String.fromInt (List.length model.outbox) ++ ")") ]
                , button
                    [ class "rounded-full border border-line px-3 py-2 text-sm text-ink-soft"
                    , onClick ShowSent
                    ]
                    [ text ("Sent (" ++ String.fromInt (List.length model.sent) ++ ")") ]
                , button
                    [ class "rounded-full border border-line px-3 py-2 text-sm text-ink-soft"
                    , onClick ShowHelp
                    ]
                    [ text "Help & FAQ" ]
                , button
                    [ class "rounded-full border border-line bg-sheet px-3 py-2 text-sm text-ink"
                    , onClick ToggleTheme
                    ]
                    [ text (if model.theme == "dark" then "Light" else "Dark") ]
                ]
            ]
        , if model.notice /= "" then
            p [ class "mb-5 rounded-xl border border-line bg-sheet px-4 py-3 text-sm text-ink-soft" ]
                [ text model.notice ]
          else
            text ""
        , case model.page of
            Desk ->
                div []
                    [ div [ class "grid gap-5 md:grid-cols-2" ]
                        [ div [ class "rounded-2xl border border-line bg-sheet p-6" ]
                            [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "Desk" ]
                            , h1 [ class "mt-2 font-serif text-4xl text-ink" ] [ text "Ready for post" ]
                            , p [ class "mt-3 leading-relaxed text-ink-soft" ] [ text ("Signed in as " ++ (if model.name == "" then "My owl" else model.name)) ]
                            , span [ class "mt-5 inline-block rounded-full border border-line px-3 py-2 text-xs text-ink-soft" ] [ text model.connectionStatus ]
                            ]
                        , div [ class "rounded-2xl border border-line bg-sheet p-6" ]
                            [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "Quick actions" ]
                            , div [ class "mt-4 grid gap-3" ]
                                [ tabButton "Connect another owl" ShowOwl
                                , tabButton "Write a letter" ShowCompose
                                , tabButton ("Open inbox (" ++ String.fromInt (List.length model.inbox + (if model.draftEnvelope == "" then 0 else 1)) ++ ")") ShowInbox
                                , tabButton ("Review outbox (" ++ String.fromInt (List.length model.outbox) ++ ")") ShowOutbox
                                , tabButton ("Review sent (" ++ String.fromInt (List.length model.sent) ++ ")") ShowSent
                                ]
                            ]
                        ]
                    ]
            Owl ->
                div [ class "mx-auto max-w-4xl" ]
                    [ identityCard model
                    , div [ class "mt-5" ] [ connectionCard model ]
                    ]
            Compose ->
                div [ class "mx-auto max-w-3xl" ] [ composerCard model ]
            Inbox ->
                div [ class "mx-auto max-w-3xl" ] [ inboxCard model ]
            Outbox ->
                div [ class "mx-auto max-w-3xl" ]
                    [ outboxCard model
                    , debugLogCard model
                    ]
            Sent ->
                div [ class "mx-auto max-w-3xl" ] [ sentCard model ]
            Help ->
                helpPage
        , case model.confirmation of
            Nothing ->
                text ""
            Just action ->
                confirmationDialog action
        ]


identityCard : Model -> Html Msg
identityCard model =
    div [ class "rounded-2xl border border-line bg-sheet p-5" ]
        [ div [ class "flex flex-col gap-4 md:flex-row md:items-end md:justify-between" ]
            [ div [ class "max-w-sm" ]
                [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "This desk" ]
                , label [ class "mt-2 block text-sm text-ink-soft" ] [ text "Owl name" ]
                , input
                    [ class "mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-ink"
                    , value model.name
                    , placeholder "Alba"
                    , onInput NameChanged
                    ]
                    []
                ]
            , div [ class "flex-1 md:max-w-2xl" ]
                [ p [ class "text-sm text-ink-soft" ] [ text "Share this owl address" ]
                , div [ class "mt-1 flex items-center gap-2" ]
                    [ p [ class "min-w-0 flex-1 truncate rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-xs text-ink" ]
                        [ text (if model.address == "" then "Creating identity..." else model.address) ]
                    , button
                        [ class "shrink-0 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink"
                        , onClick CopyAddress
                        ]
                        [ text "Copy" ]
                    , button
                        [ class "shrink-0 rounded-xl border border-line px-3 py-2.5 text-sm text-ink"
                        , onClick SaveIdentity
                        ]
                        [ text "Save" ]
                    ]
                , div [ class "mt-5 grid gap-3 md:grid-cols-2" ]
                    [ div [ class "rounded-xl border border-line bg-paper p-4" ]
                        [ p [ class "text-sm font-medium text-ink" ] [ text "Backup this owl" ]
                        , div [ class "mt-2 flex gap-2" ]
                            [ button
                                [ class "rounded-xl border border-line px-3 py-2 text-sm text-ink"
                                , onClick ExportIdentity
                                ]
                                [ text "Create backup" ]
                            , button
                                [ class "rounded-xl border border-line px-3 py-2 text-sm text-ink"
                                , onClick CopyBackup
                                ]
                                [ text "Copy backup" ]
                            , button
                                [ class "rounded-xl border border-line px-3 py-2 text-sm text-ink"
                                , onClick DownloadIdentity
                                ]
                                [ text "Download" ]
                            ]
                        , textarea
                            [ class "mt-3 min-h-20 w-full rounded-xl border border-line bg-sheet px-3 py-2 font-mono text-xs text-ink"
                            , rows 4
                            , value model.identityBackup
                            ]
                            []
                        ]
                    , div [ class "rounded-xl border border-line bg-paper p-4" ]
                        [ p [ class "text-sm font-medium text-ink" ] [ text "Restore a backup" ]
                        , textarea
                            [ class "mt-2 min-h-20 w-full rounded-xl border border-line bg-sheet px-3 py-2 font-mono text-xs text-ink"
                            , rows 4
                            , value model.importBackup
                            , onInput ImportIdentityChanged
                            , placeholder "Paste backup JSON"
                            ]
                            []
                        , button
                            [ class "mt-2 rounded-xl bg-moss px-3 py-2 text-sm text-white"
                            , onClick RequestIdentityRestore
                            ]
                            [ text "Restore owl" ]
                        , button
                            [ class "mt-2 ml-2 rounded-xl border border-line px-3 py-2 text-sm text-ink"
                            , onClick ImportIdentityFile
                            ]
                            [ text "Import file" ]
                        ]
                    ]
                ]
            ]
        ]


connectionCard : Model -> Html Msg
connectionCard model =
    div [ class "rounded-2xl border border-line bg-sheet p-5" ]
        [ div [ class "flex items-start justify-between gap-3" ]
            [ div []
                [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "Connection" ]
                , h2 [ class "mt-1 font-serif text-2xl text-ink" ] [ text "Meet another owl" ]
                ]
            , span [ class "rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft" ] [ text model.connectionStatus ]
            ]
        , if model.iceDetails == "" then
            text ""
          else
            p [ class "mt-2 font-mono text-xs text-ink-soft" ] [ text model.iceDetails ]
        , div [ class "mt-5 space-y-4" ]
            [ div [ class "rounded-xl border border-line bg-paper p-4" ]
                [ p [ class "text-sm font-semibold text-ink" ] [ text "1. One owl creates the invitation" ]
                , p [ class "mt-1 text-sm leading-relaxed text-ink-soft" ] [ text "Create and copy the invitation, then send it to the other owl." ]
                , div [ class "mt-3 flex gap-2" ]
                    [ button
                        [ class "rounded-xl bg-moss px-3 py-2 text-sm text-white"
                        , onClick CreateOffer
                        ]
                        [ text "Create invitation" ]
                    , button
                        [ class "rounded-xl border border-line px-3 py-2 text-sm text-ink"
                        , onClick CopyInvitation
                        ]
                        [ text "Copy" ]
                    ]
                ]
            , div [ class "rounded-xl border border-line bg-paper p-4" ]
                [ p [ class "text-sm font-semibold text-ink" ] [ text "2. The other owl joins" ]
                , p [ class "mt-1 text-sm leading-relaxed text-ink-soft" ] [ text "Paste the invitation, create an answer, and send it back." ]
                , textarea
                    [ class "mt-3 min-h-24 w-full rounded-xl border border-line bg-sheet px-3 py-2 font-mono text-xs text-ink"
                    , rows 4
                    , value model.invitation
                    , placeholder "Paste invitation here"
                    , onInput InvitationChanged
                    ]
                    []
                , div [ class "mt-2 flex flex-wrap gap-2" ]
                    [ button
                        [ class "rounded-xl border border-line px-3 py-2 text-sm text-ink"
                        , onClick AcceptOffer
                        ]
                        [ text "Create answer" ]
                    , button
                        [ class "rounded-xl border border-line px-3 py-2 text-sm text-ink"
                        , onClick CopyAnswer
                        ]
                        [ text "Copy answer" ]
                    ]
                ]
            , div [ class "rounded-xl border border-line bg-paper p-4" ]
                [ p [ class "text-sm font-semibold text-ink" ] [ text "3. Finish the connection" ]
                , p [ class "mt-1 text-sm leading-relaxed text-ink-soft" ] [ text "Paste the answer here on the owl that created the invitation." ]
                , textarea
                    [ class "mt-3 min-h-20 w-full rounded-xl border border-line bg-sheet px-3 py-2 font-mono text-xs text-ink"
                    , rows 3
                    , value model.answer
                    , placeholder "Paste answer here"
                    , onInput AnswerChanged
                    ]
                    []
                , button
                    [ class "mt-2 rounded-xl bg-moss px-3 py-2 text-sm text-white"
                    , onClick SetRemoteAnswer
                    ]
                    [ text "Connect" ]
                , button
                    [ class "mt-2 ml-2 rounded-xl border border-line px-3 py-2 text-sm text-ink"
                    , onClick ResetConnection
                    ]
                    [ text "Reset connection" ]
                ]
            ]
        ]


composerCard : Model -> Html Msg
composerCard model =
    div [ class "rounded-2xl border border-line bg-sheet p-5" ]
        [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "New letter" ]
        , h2 [ class "mt-1 font-serif text-2xl text-ink" ] [ text "Write" ]
        , label [ class "mt-5 block text-sm font-medium text-ink" ] [ text "Recipient owl address" ]
        , textarea
            [ class "mt-1 min-h-16 w-full rounded-xl border border-line bg-paper px-3 py-2 font-mono text-xs text-ink"
            , rows 3
            , value model.recipient
            , placeholder "owl1..."
            , onInput RecipientChanged
            ]
            []
        , div [ class "mt-2 flex flex-wrap gap-2" ]
               [ button
                   [ class "rounded-xl border border-line px-3 py-2 text-xs text-ink"
                   , onClick AddRecipientContact
                   ]
                   [ text "Save recipient" ]
               , button
                   [ class "rounded-xl border border-line px-3 py-2 text-xs text-ink"
                   , onClick SaveDraft
                   ]
                   [ text "Save draft" ]
               ]
        , if List.isEmpty model.contacts then
               text ""
          else
               div [ class "mt-3 flex flex-wrap gap-2" ]
                   (List.map contactButton model.contacts)
        , label [ class "mt-4 block text-sm font-medium text-ink" ] [ text "Subject" ]
        , input
            [ class "mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-ink"
            , value model.subject
            , placeholder "A note"
            , onInput SubjectChanged
            ]
            []
        , label [ class "mt-4 block text-sm font-medium text-ink" ] [ text "Letter" ]
        , textarea
            [ class "mt-1 min-h-52 w-full rounded-xl border border-line bg-paper px-3 py-3 leading-relaxed text-ink"
            , rows 11
            , value model.body
            , placeholder "Write in ink..."
            , onInput BodyChanged
            ]
            []
        , div [ class "mt-4" ]
            [ p [ class "text-sm font-medium text-ink" ] [ text "Keep sealed for" ]
            , div [ class "mt-2 flex flex-wrap gap-2" ]
                [ button
                    [ class
                        ("rounded-full border px-3 py-2 text-sm "
                            ++ (if model.releaseSeconds == "1" then
                                    "border-wax bg-wax text-white"
                                else
                                    "border-line bg-paper text-ink"
                               )
                        )
                    , onClick (ReleaseSecondsChanged "1")
                    ]
                    [ text "1 second (test)" ]
                , releaseButton model "1" "1 hour"
                , releaseButton model "24" "Tomorrow"
                , releaseButton model "168" "One week"
                ]
            ]
        , div [ class "mt-5 flex items-center justify-between gap-3" ]
            [ p [ class "text-xs text-ink-soft" ]
                [ text
                    (if model.sentEnvelope == "" then
                        "The peer must be connected now."
                     else
                        "Envelope sent directly."
                    )
                ]
            , button
                [ class "rounded-xl bg-wax px-5 py-3 text-sm font-semibold text-white"
                , onClick PrepareEnvelope
                ]
                [ text "Seal & send" ]
            ]
        ]


releaseButton : Model -> String -> String -> Html Msg
releaseButton model hours label =
    button
        [ class
            ("rounded-full border px-3 py-2 text-sm "
                ++ (if model.releaseHours == hours then
                        "border-moss bg-moss text-white"
                    else
                        "border-line bg-paper text-ink"
                   )
            )
        , onClick (ReleaseHoursChanged hours)
        ]
        [ text label ]


contactButton : Contact -> Html Msg
contactButton contact =
    button
        [ class "max-w-full truncate rounded-full border border-line bg-paper px-3 py-2 text-xs text-ink"
        , onClick (SelectRecipient contact.address)
        ]
        [ text contact.name ]


inboxCard : Model -> Html Msg
inboxCard model =
    div [ class "rounded-2xl border border-line bg-sheet p-5" ]
        [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "Inbox" ]
        , h2 [ class "mt-1 font-serif text-2xl text-ink" ] [ text "Sealed post" ]
        , if model.draftEnvelope == "" then
            p [ class "mt-3 text-sm text-ink-soft" ] [ text "No letter waiting to be opened." ]
          else
            div [ class "mt-4 rounded-xl border border-line bg-paper p-4" ]
                [ p [ class "text-sm text-ink-soft" ] [ text "A timed letter arrived from a connected peer." ]
                , button
                    [ class "mt-3 rounded-xl bg-moss px-3 py-2 text-sm text-white"
                    , onClick (DecryptLetter model.draftEnvelope)
                    ]
                    [ text "Open when ready" ]
                ]
        , div [ class "mt-4 space-y-3" ]
            (List.map receivedLetterView model.inbox)
        ]


receivedLetterView : Letter -> Html Msg
receivedLetterView letter =
    div [ class "rounded-xl border border-line bg-paper p-4" ]
        [ p [ class "text-xs text-gold" ] [ text ("Round " ++ String.fromInt letter.releaseRound) ]
        , h2 [ class "mt-1 font-serif text-xl text-ink" ] [ text letter.subject ]
        , p [ class "mt-1 text-xs text-ink-soft" ] [ text ("Received " ++ (if letter.receivedAt == "" then letter.sentAt else letter.receivedAt)) ]
        , p [ class "mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft" ] [ text letter.body ]
        ]


tabButton : String -> Msg -> Html Msg
tabButton label msg =
    button
        [ class "rounded-xl border border-line bg-paper px-4 py-3 text-left text-sm font-medium text-ink"
        , onClick msg
        ]
        [ text label ]


confirmationDialog : String -> Html Msg
confirmationDialog action =
    div
        [ class "dialog-backdrop"
        , Html.Attributes.attribute "role" "presentation"
        ]
        [ div
            [ class "dialog-card"
            , Html.Attributes.attribute "role" "dialog"
            , Html.Attributes.attribute "aria-modal" "true"
            , Html.Attributes.attribute "aria-labelledby" "confirm-title"
            ]
            [ h2 [ class "font-serif text-2xl text-ink", Html.Attributes.id "confirm-title" ]
                [ text
                    (case action of
                        "restore-identity" ->
                            "Restore this owl?"
                        "archive-outbox" ->
                            "Archive the outbox?"
                        "archive-sent" ->
                            "Archive sent letters?"
                        _ ->
                            "Confirm this action?"
                    )
                ]
            , p [ class "mt-3 text-sm leading-relaxed text-ink-soft" ]
                [ text
                    (case action of
                        "restore-identity" ->
                            "This replaces the current owl identity. Keep a backup first."
                        "archive-outbox" ->
                            "Prepared outbox entries move to the local archive."
                        "archive-sent" ->
                            "Full sent-letter copies move to the local archive."
                        _ ->
                            "Continue with this action?"
                    )
                ]
            , div [ class "mt-5 flex justify-end gap-2" ]
                [ button
                    [ class "rounded-xl border border-line px-4 py-2 text-sm text-ink"
                    , onClick CancelConfirmation
                    ]
                    [ text "Cancel" ]
                , button
                    [ class "rounded-xl bg-wax px-4 py-2 text-sm text-white"
                    , onClick ConfirmAction
                    ]
                    [ text "Confirm" ]
                ]
            ]
        ]


outboxCard : Model -> Html Msg
outboxCard model =
    div [ class "rounded-2xl border border-line bg-sheet p-5" ]
        [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "Outbox" ]
        , h2 [ class "mt-1 font-serif text-2xl text-ink" ] [ text "Delivery status" ]
        , p [ class "mt-2 text-sm text-ink-soft" ]
            [ text "Prepared letters remain here until their delivery status changes." ]
        , if List.isEmpty model.outbox then
            p [ class "mt-3 text-sm text-ink-soft" ] [ text "No prepared letters." ]
          else
            div [ class "mt-5 space-y-3" ]
                (List.map outboxItemView model.outbox)
        , if List.isEmpty model.outbox then
            text ""
          else
            button
                [ class "mt-5 rounded-xl border border-line px-3 py-2 text-sm text-ink"
                , onClick RequestOutboxArchive
                ]
                [ text "Archive outbox" ]
        , p [ class "mt-4 text-xs text-ink-soft" ]
            [ text ("Archived: " ++ String.fromInt (List.length model.archivedOutbox)) ]
        , if List.isEmpty model.archivedOutbox then
            text ""
          else
            div [ class "mt-3 space-y-2" ]
                (List.map archivedOutboxView model.archivedOutbox)
        ]


outboxItemView : OutboxItem -> Html Msg
outboxItemView item =
    div [ class "rounded-xl border border-line bg-paper p-4" ]
        [ div [ class "flex items-center justify-between gap-3" ]
            [ p [ class "truncate text-sm font-medium text-ink" ] [ text item.subject ]
            , span [ class "rounded-full border border-line px-2 py-1 text-xs text-ink-soft" ] [ text item.status ]
            ]
        , p [ class "mt-2 truncate font-mono text-xs text-ink-soft" ] [ text item.id ]
        , p [ class "mt-1 break-all font-mono text-xs text-ink-soft" ]
            [ text
                ("To "
                    ++ (if item.recipientName == "" then item.recipient else item.recipientName)
                    ++ (if item.recipientName == "" then "" else " · " ++ item.recipient)
                )
            ]
        , p [ class "mt-1 text-xs text-ink-soft" ] [ text item.createdAt ]
        , if item.error /= "" then
            p [ class "mt-2 text-xs text-wax" ] [ text item.error ]
          else
            text ""
        , if item.status == "failed" || item.status == "pending" then
            button
                [ class "mt-3 rounded-xl border border-line px-3 py-2 text-xs text-ink"
                , onClick (RetryEnvelope item.id)
                ]
                [ text "Retry" ]
          else
            text ""
        ]


archivedOutboxView : OutboxItem -> Html Msg
archivedOutboxView item =
    div [ class "rounded-xl border border-line bg-paper p-3" ]
        [ p [ class "text-sm font-medium text-ink" ] [ text item.subject ]
        , p [ class "mt-1 font-mono text-xs text-ink-soft" ] [ text item.id ]
        , div [ class "mt-3 flex gap-2" ]
            [ button
                [ class "rounded-xl border border-line px-3 py-2 text-xs text-ink"
                , onClick (RestoreOutbox item.id)
                ]
                [ text "Restore" ]
            , button
                [ class "rounded-xl border border-line px-3 py-2 text-xs text-wax"
                , onClick (DeleteArchivedOutbox item.id)
                ]
                [ text "Delete" ]
            ]
        ]


sentCard : Model -> Html Msg
sentCard model =
    div [ class "rounded-2xl border border-line bg-sheet p-5" ]
        [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "Sent" ]
        , h1 [ class "mt-1 font-serif text-3xl text-ink" ] [ text "Sent letters" ]
        , p [ class "mt-2 text-sm text-ink-soft" ] [ text "Full copies stay in this browser, separately from delivery status." ]
        , if List.isEmpty model.sent then
            p [ class "mt-5 text-sm text-ink-soft" ] [ text "No sent letters yet." ]
          else
            div [ class "mt-5 space-y-3" ]
                (List.map sentLetterView model.sent)
        , if List.isEmpty model.sent then
            text ""
          else
            button
                [ class "mt-5 rounded-xl border border-line px-3 py-2 text-sm text-ink"
                , onClick RequestSentArchive
                ]
                [ text "Archive sent letters" ]
        , p [ class "mt-4 text-xs text-ink-soft" ]
            [ text ("Archived: " ++ String.fromInt (List.length model.archivedSent)) ]
        , if List.isEmpty model.archivedSent then
            text ""
          else
            div [ class "mt-3 space-y-2" ]
                (List.map archivedSentView model.archivedSent)
        ]


sentLetterView : SentLetter -> Html Msg
sentLetterView letter =
    div [ class "rounded-xl border border-line bg-paper p-4" ]
        [ div [ class "flex items-start justify-between gap-3" ]
            [ h2 [ class "font-serif text-xl text-ink" ] [ text letter.subject ]
            , span [ class "shrink-0 rounded-full border border-line px-2 py-1 text-xs text-ink-soft" ] [ text letter.status ]
            ]
        , p [ class "mt-2 break-all font-mono text-xs text-ink-soft" ]
            [ text ("To " ++ letter.to) ]
        , p [ class "mt-1 text-xs text-ink-soft" ] [ text ((if letter.sentAtLocal == "" then letter.sentAt else letter.sentAtLocal) ++ " · release round " ++ String.fromInt letter.releaseRound) ]
        , p [ class "mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft" ] [ text letter.body ]
        ]


archivedSentView : SentLetter -> Html Msg
archivedSentView letter =
    div [ class "rounded-xl border border-line bg-paper p-3" ]
        [ p [ class "text-sm font-medium text-ink" ] [ text letter.subject ]
        , p [ class "mt-1 truncate font-mono text-xs text-ink-soft" ] [ text letter.id ]
        , div [ class "mt-3 flex gap-2" ]
            [ button
                [ class "rounded-xl border border-line px-3 py-2 text-xs text-ink"
                , onClick (RestoreSent letter.id)
                ]
                [ text "Restore" ]
            , button
                [ class "rounded-xl border border-line px-3 py-2 text-xs text-wax"
                , onClick (DeleteArchivedSent letter.id)
                ]
                [ text "Delete" ]
            ]
        ]


debugLogCard : Model -> Html Msg
debugLogCard model =
    div [ class "mt-5 rounded-2xl border border-line bg-sheet p-5" ]
        [ div [ class "flex items-center justify-between" ]
            [ div []
                [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "Debug" ]
                , h2 [ class "mt-1 font-serif text-2xl text-ink" ] [ text "Recent activity" ]
                ]
            , button
                [ class "rounded-xl border border-line px-3 py-2 text-xs text-ink"
                , onClick ClearDebugLog
                ]
                [ text "Clear" ]
            ]
        , if List.isEmpty model.debugLogs then
            p [ class "mt-4 text-sm text-ink-soft" ] [ text "No debug events yet." ]
          else
            div [ class "mt-4 max-h-64 overflow-auto rounded-xl border border-line bg-paper p-3" ]
                (List.map debugLogLine model.debugLogs)
        ]


debugLogLine : String -> Html Msg
debugLogLine line =
    p [ class "border-b border-line py-2 font-mono text-xs leading-relaxed text-ink-soft last:border-b-0" ]
        [ text line ]


helpPage : Html Msg
helpPage =
    div [ class "mx-auto max-w-3xl" ]
        [ div [ class "rounded-2xl border border-line bg-sheet p-6 md:p-8" ]
            [ p [ class "text-xs font-semibold uppercase tracking-widest text-gold" ] [ text "Help & FAQ" ]
            , h1 [ class "mt-2 font-serif text-4xl text-ink" ] [ text "How Hedwig works" ]
            , p [ class "mt-3 max-w-2xl leading-relaxed text-ink-soft" ]
                [ text "Hedwig is a small, peer-to-peer letter desk. Both owls need to be online at the same time, and there is no message server or offline mailbox." ]
            , div [ class "mt-7 space-y-3" ]
                [ faq "How do I connect two owls?"
                    [ text "Send your owl address to the other person. One owl creates an invitation and sends the code to the other. The second owl creates an answer and sends it back. Paste the answer into the first owl and choose Connect." ]
                , faq "Does the letter stay in storage?"
                    [ text "No mailbox keeps copies. After the data channel transfers the encrypted letter, the sender and recipient hold local copies according to their browser state. If you close before transfer, the unsent letter remains a draft only if you have prepared it locally." ]
                , faq "Can someone read it early?"
                    [ text "The letter is protected by the recipient’s public key and a drand TLock round. Neither the network nor the sender should be able to open it before the selected round." ]
                , faq "Why do both peers need to be online?"
                    [ text "The MVP uses direct WebRTC. There is deliberately no relay server or offline storage. This makes sending feel like a short, old-fashioned encounter." ]
                , faq "What happens if a connection fails?"
                    [ text "Try again in the same browser and use STUN-capable networks. Strict firewalls or symmetric NATs may prevent a direct connection. The MVP does not silently route through a TURN server." ]
                , faq "Is this a finished encrypted messenger?"
                    [ text "No. This is an MVP for testing identity, timed envelopes, manual signaling, direct transfer, and decryption. Security properties should be independently audited before sensitive use." ]
                , faq "Does changing my owl name create a new identity?"
                    [ text "No. Names are labels. Clearing browser storage may remove or replace the local identity key, so copy a backup before relying on it." ]
                , faq "Where are the keys stored?"
                    [ text "The MVP stores identity material in local browser storage. Browser profiles and devices do not share identities." ]
                ]
            , button
                [ class "mt-7 rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-ink"
                , onClick ShowDesk
                ]
                [ text "Return to desk" ]
            ]
        ]


faq : String -> List (Html Msg) -> Html Msg
faq question answer =
    details
        [ class "rounded-xl border border-line bg-paper px-4 py-3" ]
        [ summary [ class "cursor-pointer text-sm font-semibold text-ink" ] [ text question ]
        , p [ class "mt-3 leading-relaxed text-sm text-ink-soft" ] answer
        ]

port module Main exposing (main)

import Browser
import Html exposing (Html, button, details, div, form, h1, h2, header, input, label, nav, p, span, summary, text, textarea)
import Html.Attributes exposing (attribute, class, disabled, for, hidden, id, placeholder, readonly, rows, type_, value)
import Html.Events exposing (onClick, onInput, onSubmit)
import Json.Decode as D
import Json.Encode as E
import Task
import Time


port themeChanged : String -> Cmd msg
port navigateHash : String -> Cmd msg
port hashChanged : (String -> msg) -> Sub msg
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
    , now : Int
    , tzOffset : Int
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


type alias SealedLetter =
    { raw : String
    , from : String
    , releaseRound : Int
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
    , releaseChoice : String
    }


type alias Notice =
    { text : String
    , tone : NoticeTone
    }


type NoticeTone
    = Success
    | Error
    | Info


type alias Problems =
    { recipient : String
    , subject : String
    , body : String
    }


type alias Delay =
    { hours : Float
    , seconds : Float
    }


type Phase
    = Booting
    | Welcome
    | Ready


type Page
    = Desk
    | Pair
    | Compose
    | Inbox
    | Outbox
    | Sent
    | Help


type PairMode
    = Invite
    | Join


type ReleaseChoice
    = TomorrowMorning
    | FewDays
    | NextWeek
    | CustomDay String
    | TestSecond


type alias Model =
    { location : String
    , page : Page
    , phase : Phase
    , theme : String
    , dev : Bool
    , zone : Time.Zone
    , now : Time.Posix
    , name : String
    , address : String
    , submitting : Bool
    , nameError : String
    , pairMode : PairMode
    , createdInvitation : String
    , pastedInvitation : String
    , createdAnswer : String
    , pastedAnswer : String
    , pairInviteError : String
    , pairAnswerError : String
    , connectionStatus : String
    , iceDetails : String
    , showDetails : Bool
    , moreOpen : Bool
    , copied : String
    , notice : Maybe Notice
    , friendName : String
    , contactError : String
    , recipient : String
    , subject : String
    , body : String
    , releaseChoice : ReleaseChoice
    , composeTried : Bool
    , openDateError : String
    , inbox : List Letter
    , sealed : List SealedLetter
    , openingKey : String
    , contacts : List Contact
    , drafts : List Draft
    , identityBackup : String
    , importBackup : String
    , outbox : List OutboxItem
    , sent : List SentLetter
    , archivedOutbox : List OutboxItem
    , archivedSent : List SentLetter
    , confirmation : Maybe String
    , debugLogs : List String
    }


type Msg
    = ToggleTheme
    | Go Page
    | HashChanged String
    | GotNow Time.Posix
    | DismissNotice
    | ToggleDetails
    | ToggleMore
    | SubmitWelcome
    | NameChanged String
    | SaveIdentity
    | IdentityResult D.Value
    | CopyAddress
    | CopyInvitation
    | CopyAnswer
    | CopyBackup
    | SetPairMode PairMode
    | PastedInvitationChanged String
    | PastedAnswerChanged String
    | CreateOffer
    | OfferResult D.Value
    | AcceptOffer
    | AnswerResult D.Value
    | SetRemoteAnswer
    | ConnectionResult D.Value
    | ResetConnection
    | FriendNameChanged String
    | RecipientChanged String
    | SubjectChanged String
    | BodyChanged String
    | ChooseRelease ReleaseChoice
    | CustomDateChanged String
    | PrepareEnvelope
    | SendPrepared Time.Posix
    | EnvelopeSentResult D.Value
    | EnvelopeReceivedResult D.Value
    | OpenSealed String
    | LetterDecryptedResult D.Value
    | BridgeErrorResult D.Value
    | DebugLogResult D.Value
    | ClearDebugLog
    | RetryEnvelope String
    | SaveDraft
    | AddRecipientContact
    | SelectContact String
    | StateLoadedResult D.Value
    | ExportIdentity
    | IdentityExportedResult D.Value
    | ImportIdentityChanged String
    | RequestIdentityRestore
    | ImportIdentityFile
    | IdentityFileLoadedResult D.Value
    | RequestOutboxArchive
    | RequestSentArchive
    | CancelConfirmation
    | ConfirmAction
    | DownloadIdentity
    | RestoreOutbox String
    | DeleteArchivedOutbox String
    | RestoreSent String
    | DeleteArchivedSent String


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
      , page = pageFromHash flags.location
      , phase = Booting
      , theme = if flags.theme == "light" then "light" else "dark"
      , dev = String.contains "dev=1" flags.location
      , zone = Time.customZone flags.tzOffset []
      , now = Time.millisToPosix flags.now
      , name = ""
      , address = ""
      , submitting = False
      , nameError = ""
      , pairMode = Invite
      , createdInvitation = ""
      , pastedInvitation = ""
      , createdAnswer = ""
      , pastedAnswer = ""
      , pairInviteError = ""
      , pairAnswerError = ""
      , connectionStatus = "Disconnected"
      , iceDetails = ""
      , showDetails = False
      , moreOpen = False
      , copied = ""
      , notice = Nothing
      , friendName = ""
      , contactError = ""
      , recipient = ""
      , subject = ""
      , body = ""
      , releaseChoice = TomorrowMorning
      , composeTried = False
      , openDateError = ""
      , inbox = []
      , sealed = []
      , openingKey = ""
      , contacts = []
      , drafts = []
      , identityBackup = ""
      , importBackup = ""
      , outbox = []
      , sent = []
      , archivedOutbox = []
      , archivedSent = []
      , confirmation = Nothing
      , debugLogs = []
      }
    , Cmd.batch
        [ initializeIdentity (E.object [ ( "name", E.string "" ) ])
        , Task.perform GotNow Time.now
        ]
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
        , hashChanged HashChanged
        ]


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        ToggleTheme ->
            let
                nextTheme =
                    if model.theme == "dark" then
                        "light"
                    else
                        "dark"
            in
            ( { model | theme = nextTheme }, themeChanged nextTheme )

        Go page ->
            ( { model | page = page, moreOpen = False }
            , Cmd.batch
                [ if model.phase == Ready then
                    navigateHash (hashFor page)
                  else
                    Cmd.none
                , Task.perform GotNow Time.now
                ]
            )

        HashChanged hash ->
            if model.phase /= Ready then
                ( model, Cmd.none )
            else
                ( { model | page = pageFromHash hash }, Cmd.none )

        GotNow now ->
            ( { model | now = now }, Cmd.none )

        DismissNotice ->
            ( { model | notice = Nothing }, Cmd.none )

        ToggleDetails ->
            ( { model | showDetails = not model.showDetails }, Cmd.none )

        ToggleMore ->
            ( { model | moreOpen = not model.moreOpen }, Cmd.none )

        SubmitWelcome ->
            let
                trimmed =
                    String.trim model.name
            in
            if trimmed == "" then
                ( { model | nameError = "Tell your friend what to call you." }, Cmd.none )
            else
                ( { model | name = trimmed, nameError = "", submitting = True }
                , initializeIdentity (E.object [ ( "name", E.string trimmed ) ])
                )

        NameChanged value ->
            ( { model | name = value, nameError = "" }, Cmd.none )

        SaveIdentity ->
            let
                trimmed =
                    String.trim model.name
            in
            if trimmed == "" then
                ( { model | nameError = "Tell your friend what to call you." }, Cmd.none )
            else
                ( { model | name = trimmed, nameError = "", notice = Just (Notice "Name saved" Success) }
                , initializeIdentity (E.object [ ( "name", E.string trimmed ) ])
                )

        IdentityResult value ->
            case
                D.decodeValue
                    (D.map3 (\address name needsWelcome -> ( address, name, needsWelcome ))
                        (D.field "address" D.string)
                        (D.field "name" D.string)
                        (D.oneOf [ D.field "welcome" D.bool, D.succeed False ])
                    )
                    value
            of
                Ok ( _, _, True ) ->
                    ( { model | phase = Welcome, submitting = False }, Cmd.none )

                Ok ( "", _, _ ) ->
                    ( { model | phase = Welcome, submitting = False }, Cmd.none )

                Ok ( address, name, _ ) ->
                    ( { model
                        | phase = Ready
                        , submitting = False
                        , address = address
                        , name = name
                        , nameError = ""
                      }
                    , Cmd.none
                    )

                Err _ ->
                    ( { model
                        | phase =
                            if model.phase == Booting then
                                Welcome
                            else
                                model.phase
                        , submitting = False
                      }
                    , Cmd.none
                    )

        CopyAddress ->
            ( { model | copied = "address", notice = Just (Notice "Letter address copied" Success) }
            , copyText model.address
            )

        CopyInvitation ->
            if model.createdInvitation == "" then
                ( model, Cmd.none )
            else
                ( { model | copied = "invitation", notice = Just (Notice "Invitation copied" Success) }
                , copyText model.createdInvitation
                )

        CopyAnswer ->
            if model.createdAnswer == "" then
                ( model, Cmd.none )
            else
                ( { model | copied = "answer", notice = Just (Notice "Answer copied" Success) }
                , copyText model.createdAnswer
                )

        CopyBackup ->
            ( { model | copied = "backup", notice = Just (Notice "Backup copied" Success) }
            , copyText model.identityBackup
            )

        SetPairMode mode ->
            ( { model | pairMode = mode }, Cmd.none )

        PastedInvitationChanged value ->
            ( { model | pastedInvitation = value, pairInviteError = "" }, Cmd.none )

        PastedAnswerChanged value ->
            ( { model | pastedAnswer = value, pairAnswerError = "" }, Cmd.none )

        CreateOffer ->
            ( model, createOffer () )

        OfferResult value ->
            case D.decodeValue (D.field "sdp" D.string) value of
                Ok sdp ->
                    ( { model
                        | createdInvitation = sdp
                        , connectionStatus = "Waiting for your friend…"
                        , copied = ""
                      }
                    , Cmd.none
                    )

                Err _ ->
                    ( model, Cmd.none )

        AcceptOffer ->
            if String.trim model.pastedInvitation == "" then
                ( { model | pairInviteError = "Paste your friend's invitation first." }, Cmd.none )
            else
                ( { model | pairInviteError = "" }
                , acceptOffer (String.trim model.pastedInvitation)
                )

        AnswerResult value ->
            case D.decodeValue (D.field "sdp" D.string) value of
                Ok sdp ->
                    ( { model
                        | createdAnswer = sdp
                        , connectionStatus = "Waiting for your friend…"
                        , copied = ""
                      }
                    , Cmd.none
                    )

                Err _ ->
                    ( model, Cmd.none )

        SetRemoteAnswer ->
            if String.trim model.pastedAnswer == "" then
                ( { model | pairAnswerError = "Paste your friend's answer first." }, Cmd.none )
            else
                ( { model | pairAnswerError = "" }
                , setRemoteAnswer (String.trim model.pastedAnswer)
                )

        ConnectionResult value ->
            case
                D.decodeValue
                    (D.map2 Tuple.pair
                        (D.field "status" D.string)
                        (D.oneOf [ D.field "detail" D.string, D.succeed "" ])
                    )
                    value
            of
                Ok ( status, detail ) ->
                    ( { model
                        | connectionStatus = normalizeStatus model.connectionStatus status
                        , iceDetails =
                            if detail == "" then
                                model.iceDetails
                            else
                                detail
                      }
                    , Cmd.none
                    )

                Err _ ->
                    ( model, Cmd.none )

        ResetConnection ->
            ( { model
                | createdInvitation = ""
                , pastedInvitation = ""
                , createdAnswer = ""
                , pastedAnswer = ""
                , connectionStatus = "Disconnected"
                , iceDetails = ""
                , notice = Just (Notice "Connection reset" Info)
              }
            , resetConnection ()
            )

        FriendNameChanged value ->
            ( { model | friendName = value, contactError = "" }, Cmd.none )

        RecipientChanged value ->
            ( { model | recipient = value }, Cmd.none )

        SubjectChanged value ->
            ( { model | subject = value }, Cmd.none )

        BodyChanged value ->
            ( { model | body = value }, Cmd.none )

        ChooseRelease choice ->
            ( { model | releaseChoice = choice, openDateError = "" }, Cmd.none )

        CustomDateChanged value ->
            ( { model | releaseChoice = CustomDay value, openDateError = "" }, Cmd.none )

        PrepareEnvelope ->
            let
                found =
                    problems model
            in
            if hasProblems found then
                ( { model | composeTried = True }, Cmd.none )
            else
                ( { model | composeTried = True }, Task.perform SendPrepared Time.now )

        SendPrepared now ->
            case releaseDelay model.zone now (effectiveChoice model) of
                Err message ->
                    ( { model | now = now, openDateError = message }, Cmd.none )

                Ok delay ->
                    ( { model | now = now, openDateError = "", notice = Just (Notice "Sealing your letter…" Info) }
                    , prepareEnvelope
                        (E.object
                            [ ( "recipient", E.string (String.trim model.recipient) )
                            , ( "subject", E.string (String.trim model.subject) )
                            , ( "body", E.string model.body )
                            , ( "releaseHours", E.float delay.hours )
                            , ( "releaseSeconds", E.float delay.seconds )
                            ]
                        )
                    )

        EnvelopeSentResult value ->
            case
                D.decodeValue
                    (D.map2 Tuple.pair
                        (D.field "envelope" D.string)
                        (D.maybe (D.field "confirmed" D.bool))
                    )
                    value
            of
                Ok ( _, confirmed ) ->
                    ( { model
                        | notice =
                            Just
                                (Notice
                                    (if confirmed == Just True then
                                        "Your friend has the letter."
                                     else
                                        "The letter is crossing over."
                                    )
                                    Success
                                )
                      }
                    , Cmd.none
                    )

                Err _ ->
                    ( model, Cmd.none )

        EnvelopeReceivedResult _ ->
            ( { model | notice = Just (Notice "A letter arrived. It will open on its day." Success) }
            , Cmd.none
            )

        OpenSealed raw ->
            ( { model | openingKey = raw }, decryptEnvelope raw )

        LetterDecryptedResult value ->
            case D.decodeValue letterDecoder value of
                Ok letter ->
                    ( { model
                        | inbox = letter :: model.inbox
                        , openingKey = ""
                        , notice = Just (Notice "The letter is open." Success)
                      }
                    , Cmd.none
                    )

                Err _ ->
                    ( { model | openingKey = "" }, Cmd.none )

        BridgeErrorResult value ->
            case D.decodeValue (D.field "message" D.string) value of
                Ok message ->
                    ( { model | notice = Just (Notice message Error), openingKey = "" }, Cmd.none )

                Err _ ->
                    ( model, Cmd.none )

        DebugLogResult value ->
            case
                D.decodeValue
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
            if String.trim model.subject == "" && String.trim model.body == "" && String.trim model.recipient == "" then
                ( { model | notice = Just (Notice "Write a little before saving." Info) }, Cmd.none )
            else
                let
                    choice =
                        effectiveChoice model
                in
                ( { model | notice = Just (Notice "Saved" Success) }
                , saveDraft
                    (E.object
                        [ ( "recipient", E.string model.recipient )
                        , ( "subject", E.string model.subject )
                        , ( "body", E.string model.body )
                        , ( "releaseHours", E.string (choiceHours choice) )
                        , ( "releaseSeconds", E.string (choiceSeconds choice) )
                        , ( "releaseChoice", E.string (choiceKey choice) )
                        ]
                    )
                )

        AddRecipientContact ->
            if String.trim model.friendName == "" then
                ( { model | contactError = "Give your friend a name." }, Cmd.none )
            else if not (looseAddress (String.trim model.recipient)) then
                ( { model | contactError = "That letter address does not look right." }, Cmd.none )
            else
                ( { model
                    | contactError = ""
                    , notice = Just (Notice ("Saved " ++ String.trim model.friendName ++ " to your contacts.") Success)
                  }
                , saveContact
                    (E.object
                        [ ( "name", E.string (String.trim model.friendName) )
                        , ( "address", E.string (String.trim model.recipient) )
                        ]
                    )
                )

        SelectContact address ->
            ( { model
                | recipient = address
                , friendName = namedContact model.contacts address |> Maybe.withDefault model.friendName
              }
            , Cmd.none
            )

        ExportIdentity ->
            ( model, exportIdentity () )

        IdentityExportedResult value ->
            case D.decodeValue (D.field "backup" D.string) value of
                Ok backup ->
                    ( { model | identityBackup = backup, notice = Just (Notice "Your backup is ready" Success) }
                    , Cmd.none
                    )

                Err _ ->
                    ( model, Cmd.none )

        ImportIdentityChanged value ->
            ( { model | importBackup = value }, Cmd.none )

        RequestIdentityRestore ->
            if model.importBackup == "" then
                ( { model | notice = Just (Notice "Paste a backup first." Info) }, Cmd.none )
            else
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
                    ( { model
                        | importBackup = backup
                        , notice = Just (Notice "Backup file loaded. Restore it only if it belongs to this desk." Info)
                      }
                    , Cmd.none
                    )

                Err _ ->
                    ( { model | notice = Just (Notice "That backup file could not be read." Error) }, Cmd.none )

        RestoreOutbox id ->
            ( model, restoreOutbox id )

        DeleteArchivedOutbox id ->
            ( model, deleteArchivedOutbox id )

        RestoreSent id ->
            ( model, restoreSent id )

        DeleteArchivedSent id ->
            ( model, deleteArchivedSent id )

        StateLoadedResult value ->
            case D.decodeValue stateDecoder value of
                Ok state ->
                    let
                        restored =
                            case List.head state.drafts of
                                Just draft ->
                                    { model
                                        | recipient = draft.recipient
                                        , subject = draft.subject
                                        , body = draft.body
                                        , releaseChoice = coerceChoice model.dev (storedToChoice draft.releaseChoice draft.releaseHours draft.releaseSeconds)
                                    }

                                Nothing ->
                                    model
                    in
                    ( { restored
                        | contacts = state.contacts
                        , drafts = state.drafts
                        , sealed = List.map decodeSealed state.sealed
                        , inbox = state.inbox
                        , outbox = state.outbox
                        , sent = state.sent
                        , archivedOutbox = state.archivedOutbox
                        , archivedSent = state.archivedSent
                      }
                    , Cmd.none
                    )

                Err _ ->
                    ( model, Cmd.none )


view : Model -> Html Msg
view model =
    case model.phase of
        Booting ->
            div [ class "boot" ]
                [ div []
                    [ span [ class "sprig", attribute "aria-hidden" "true" ] []
                    , p [] [ text "Opening the desk…" ]
                    ]
                ]

        Welcome ->
            welcome model

        Ready ->
            div [ class "app" ]
                [ header [ class "topbar" ]
                    [ button [ type_ "button", class "brand", onClick (Go Desk) ]
                        [ span [ class "sprig", attribute "aria-hidden" "true" ] []
                        , span [ class "brand-copy" ]
                            [ span [ class "brand-kicker" ] [ text "Ophelia's" ]
                            , span [ class "brand-title" ] [ text "Rosemaries" ]
                            ]
                        ]
                    , nav [ class "section-nav", attribute "aria-label" "Sections" ]
                        [ navButton "Desk" (model.page == Desk) (Go Desk)
                        , navButton "Write" (model.page == Compose) (Go Compose)
                        , navButton "Inbox" (model.page == Inbox) (Go Inbox)
                        , navButton "Pair" (model.page == Pair) (Go Pair)
                        , moreMenu model
                        ]
                    , themeButton model
                    ]
                , noticeView model.notice
                , case model.page of
                    Desk ->
                        deskHome model

                    Pair ->
                        pairPage model

                    Compose ->
                        div [ class "screen" ] [ composer model ]

                    Inbox ->
                        div [ class "screen" ] [ inboxPage model ]

                    Outbox ->
                        div [ class "screen" ] [ outboxPage model ]

                    Sent ->
                        div [ class "screen" ] [ sentPage model ]

                    Help ->
                        div [ class "screen" ] [ helpPage ]
                , case model.confirmation of
                    Nothing ->
                        text ""

                    Just action ->
                        confirmationDialog action
                ]


welcome : Model -> Html Msg
welcome model =
    div [ class "app" ]
        [ div [ class "topbar" ]
            [ span [ class "brand-copy" ]
                [ span [ class "brand-kicker" ] [ text "Ophelia's" ]
                , span [ class "brand-title" ] [ text "Rosemaries" ]
                ]
            , themeButton model
            ]
        , div [ class "welcome" ]
            [ span [ class "sprig", attribute "aria-hidden" "true" ] []
            , h1 [] [ text "Welcome" ]
            , p [ class "lede" ] [ text "Ophelia's Rosemaries is a small desk for letters between two friends." ]
            , p [ class "lede" ] [ text "You write whenever you like, and seal each letter for a day. It stays closed until that day arrives." ]
            , p [ class "lede" ] [ text "To pass a letter across, you both need to be here together. There is no mailbox in between." ]
            , form [ onSubmit SubmitWelcome ]
                [ label [ class "lbl", for "welcome-name" ] [ text "Your name" ]
                , input
                    ([ class "field"
                     , id "welcome-name"
                     , type_ "text"
                     , value model.name
                     , placeholder "A name they will know"
                     , attribute "autocomplete" "name"
                     , onInput NameChanged
                     ]
                        ++ described "welcome-name-error" model.nameError
                    )
                    []
                , fieldError "welcome-name-error" model.nameError
                , div [ class "actions" ]
                    [ button [ class "btn btn-primary", type_ "submit", disabled model.submitting ]
                        [ text
                            (if model.submitting then
                                "Opening…"
                             else
                                "Open my desk"
                            )
                        ]
                    ]
                ]
            ]
        ]


deskHome : Model -> Html Msg
deskHome model =
    let
        sealedCount =
            List.length model.sealed

        waitingCount =
            List.length (List.filter (\item -> item.status /= "sent") model.outbox)
    in
    div [ class "home" ]
        [ span [ class "sprig", attribute "aria-hidden" "true" ] []
        , p [ class "today" ] [ text (formatDate model.zone model.now) ]
        , h1 [] [ text (greeting model.zone model.now model.name) ]
        , p [ class "lede" ] [ text "Write whenever you like. Each letter opens on the day you choose." ]
        , div [ class "counts" ]
            [ p [] [ text (sealedSentence sealedCount) ]
            , if waitingCount == 0 then
                text ""
              else
                p [] [ text (waitingSentence waitingCount) ]
            ]
        , div [ class "actions" ]
            [ if sealedCount > 0 then
                button [ type_ "button", class "btn btn-primary", onClick (Go Inbox) ] [ text "Open your letters" ]
              else
                button [ type_ "button", class "btn btn-primary", onClick (Go Compose) ] [ text "Write a letter" ]
            ]
        ]


pairPage : Model -> Html Msg
pairPage model =
    div [ class "screen stack" ]
        [ div []
            [ h1 [] [ text "Pair with a friend" ]
            , p [ class "lede" ] [ text "One of you invites. The other joins. Then a letter can cross." ]
            , p
                [ class "status-line"
                , attribute "data-testid" "connection-status"
                , attribute "data-state" (statusState model.connectionStatus)
                ]
                [ text model.connectionStatus ]
            ]
        , div [ class "tabs", attribute "role" "tablist", attribute "aria-label" "Pairing" ]
            [ button
                [ type_ "button"
                , class "choice"
                , id "tab-invite"
                , attribute "role" "tab"
                , attribute "aria-selected" (boolAttr (model.pairMode == Invite))
                , attribute "aria-controls" "panel-invite"
                , onClick (SetPairMode Invite)
                ]
                [ text "Invite a friend" ]
            , button
                [ type_ "button"
                , class "choice"
                , id "tab-join"
                , attribute "role" "tab"
                , attribute "aria-selected" (boolAttr (model.pairMode == Join))
                , attribute "aria-controls" "panel-join"
                , onClick (SetPairMode Join)
                ]
                [ text "Join a friend" ]
            ]
        , div
            [ id "panel-invite"
            , attribute "role" "tabpanel"
            , attribute "aria-labelledby" "tab-invite"
            , hidden (model.pairMode /= Invite)
            ]
            [ inviteFlow model ]
        , div
            [ id "panel-join"
            , attribute "role" "tabpanel"
            , attribute "aria-labelledby" "tab-join"
            , hidden (model.pairMode /= Join)
            ]
            [ joinFlow model ]
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-ghost", onClick ResetConnection ] [ text "Reset connection" ]
            ]
        , div [ class "card" ]
            [ button
                [ type_ "button"
                , class "btn btn-ghost"
                , attribute "aria-expanded" (boolAttr model.showDetails)
                , onClick ToggleDetails
                ]
                [ text "Details" ]
            , if model.showDetails then
                div []
                    [ p [ class "meta mono" ]
                        [ text
                            (if model.iceDetails == "" then
                                "No connection notes yet."
                             else
                                model.iceDetails
                            )
                        ]
                    , if List.isEmpty model.debugLogs then
                        p [ class "meta" ] [ text "No recent notes." ]
                      else
                        div [ class "log" ] (List.map (\line -> p [ class "mono" ] [ text line ]) model.debugLogs)
                    , button [ type_ "button", class "btn btn-ghost", onClick ClearDebugLog ] [ text "Clear" ]
                    ]
              else
                text ""
            ]
        , identityCard model
        ]


inviteFlow : Model -> Html Msg
inviteFlow model =
    div [ class "card" ]
        [ h2 [] [ text "Invite a friend" ]
        , p [ class "quiet" ] [ text "Create an invitation, copy it, and send it to them. Their reply comes back here." ]
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-primary", onClick CreateOffer ] [ text "Create invitation" ]
            , button [ type_ "button", class "btn btn-ghost", onClick CopyInvitation ] [ text "Copy invitation" ]
            , if model.copied == "invitation" then
                span [ class "copied" ] [ text "Copied" ]
              else
                text ""
            ]
        , label [ class "lbl", for "your-invitation" ] [ text "Your invitation" ]
        , textarea
            [ class "field mono"
            , id "your-invitation"
            , rows 3
            , readonly True
            , value model.createdInvitation
            , placeholder "Your invitation will appear here"
            ]
            []
        , label [ class "lbl", for "friend-answer" ] [ text "Friend's answer" ]
        , textarea
            ([ class "field mono"
             , id "friend-answer"
             , rows 3
             , value model.pastedAnswer
             , placeholder "Paste your friend's answer"
             , onInput PastedAnswerChanged
             ]
                ++ described "friend-answer-error" model.pairAnswerError
            )
            []
        , fieldError "friend-answer-error" model.pairAnswerError
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-primary", onClick SetRemoteAnswer ] [ text "Connect" ]
            ]
        ]


joinFlow : Model -> Html Msg
joinFlow model =
    div [ class "card" ]
        [ h2 [] [ text "Join a friend" ]
        , p [ class "quiet" ] [ text "Paste the invitation they sent you, then copy your answer back to them." ]
        , label [ class "lbl", for "friend-invitation" ] [ text "Friend's invitation" ]
        , textarea
            ([ class "field mono"
             , id "friend-invitation"
             , rows 3
             , value model.pastedInvitation
             , placeholder "Paste your friend's invitation"
             , onInput PastedInvitationChanged
             ]
                ++ described "friend-invitation-error" model.pairInviteError
            )
            []
        , fieldError "friend-invitation-error" model.pairInviteError
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-primary", onClick AcceptOffer ] [ text "Create answer" ]
            ]
        , label [ class "lbl", for "your-answer" ] [ text "Your answer" ]
        , textarea
            [ class "field mono"
            , id "your-answer"
            , rows 3
            , readonly True
            , value model.createdAnswer
            , placeholder "Your answer will appear here"
            ]
            []
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-ghost", onClick CopyAnswer ] [ text "Copy answer" ]
            , if model.copied == "answer" then
                span [ class "copied" ] [ text "Copied" ]
              else
                text ""
            ]
        ]


identityCard : Model -> Html Msg
identityCard model =
    div [ class "card" ]
        [ h2 [] [ text "Your desk" ]
        , label [ class "lbl", for "desk-name" ] [ text "Your name" ]
        , input
            ([ class "field"
             , id "desk-name"
             , type_ "text"
             , value model.name
             , onInput NameChanged
             ]
                ++ described "desk-name-error" model.nameError
            )
            []
        , fieldError "desk-name-error" model.nameError
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-ghost", onClick SaveIdentity ] [ text "Save name" ]
            ]
        , p [ class "lbl" ] [ text "Your letter address" ]
        , p [ class "mono address" ] [ text (if model.address == "" then "Preparing your address…" else model.address) ]
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-ghost", onClick CopyAddress ] [ text "Copy address" ]
            , if model.copied == "address" then
                span [ class "copied" ] [ text "Copied" ]
              else
                text ""
            ]
        , h2 [ class "today" ] [ text "Keep a backup" ]
        , p [ class "quiet" ] [ text "This file holds the keys to your desk. Keep it private." ]
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-ghost", onClick ExportIdentity ] [ text "Create backup" ]
            , button [ type_ "button", class "btn btn-ghost", onClick CopyBackup ] [ text "Copy backup" ]
            , button [ type_ "button", class "btn btn-ghost", onClick DownloadIdentity ] [ text "Download" ]
            ]
        , textarea
            [ class "field mono"
            , rows 4
            , readonly True
            , value model.identityBackup
            ]
            []
        , label [ class "lbl", for "restore-json" ] [ text "Backup to restore" ]
        , textarea
            [ class "field mono"
            , id "restore-json"
            , rows 5
            , value model.importBackup
            , placeholder "Paste backup JSON"
            , onInput ImportIdentityChanged
            ]
            []
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-primary", onClick RequestIdentityRestore ] [ text "Restore backup" ]
            , button [ type_ "button", class "btn btn-ghost", onClick ImportIdentityFile ] [ text "Import file" ]
            ]
        ]


composer : Model -> Html Msg
composer model =
    let
        found =
            if model.composeTried then
                problems model
            else
                Problems "" "" ""

        choice =
            effectiveChoice model
    in
    div [ class "card" ]
        [ h1 [] [ text "Write a letter" ]
        , p [ class "lede" ] [ text "Seal it for a day. It opens then, and not before." ]
        , label [ class "lbl", for "friend-name" ] [ text "Their name" ]
        , input
            [ class "field"
            , id "friend-name"
            , type_ "text"
            , value model.friendName
            , placeholder "Sam"
            , onInput FriendNameChanged
            ]
            []
        , label [ class "lbl", for "their-address" ] [ text "Their address" ]
        , textarea
            ([ class "field mono"
             , id "their-address"
             , rows 2
             , value model.recipient
             , placeholder "owl1…"
             , attribute "spellcheck" "false"
             , onInput RecipientChanged
             ]
                ++ described "their-address-error" found.recipient
            )
            []
        , fieldError "their-address-error" found.recipient
        , fieldError "contact-error" model.contactError
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-ghost", onClick AddRecipientContact ] [ text "Save to contacts" ]
            , button [ type_ "button", class "btn btn-ghost", onClick SaveDraft ] [ text "Save draft" ]
            ]
        , if List.isEmpty model.contacts then
            text ""
          else
            div [ class "chips" ] (List.map contactChip model.contacts)
        , label [ class "lbl", for "subject" ] [ text "Subject" ]
        , input
            ([ class "field"
             , id "subject"
             , type_ "text"
             , value model.subject
             , placeholder "A small heading"
             , onInput SubjectChanged
             ]
                ++ described "subject-error" found.subject
            )
            []
        , fieldError "subject-error" found.subject
        , p [ class "lbl" ] [ text "When it opens" ]
        , div [ class "choices", attribute "role" "group", attribute "aria-label" "When it opens" ]
            [ choiceButton "Tomorrow morning" (choice == TomorrowMorning) (ChooseRelease TomorrowMorning)
            , choiceButton "In a few days" (choice == FewDays) (ChooseRelease FewDays)
            , choiceButton "Next week" (choice == NextWeek) (ChooseRelease NextWeek)
            , choiceButton "Choose a date" (isCustom choice) (ChooseRelease (CustomDay (customDate choice)))
            , if model.dev then
                choiceButton "1 second (test)" (choice == TestSecond) (ChooseRelease TestSecond)
              else
                text ""
            ]
        , if isCustom choice then
            div []
                [ label [ class "lbl", for "open-on" ] [ text "Open on" ]
                , input
                    [ class "field"
                    , id "open-on"
                    , type_ "date"
                    , value (customDate choice)
                    , onInput CustomDateChanged
                    ]
                    []
                ]
          else
            text ""
        , fieldError "open-date-error" model.openDateError
        , label [ class "lbl", for "letter-body" ] [ text "The letter" ]
        , textarea
            ([ class "field letter-body"
             , id "letter-body"
             , rows 11
             , value model.body
             , placeholder "Write as if they will open this on the day you chose."
             , onInput BodyChanged
             ]
                ++ described "letter-body-error" found.body
            )
            []
        , fieldError "letter-body-error" found.body
        , p [ class "meta" ] [ text "You both need to be connected for it to cross." ]
        , button [ type_ "button", class "seal-button", onClick PrepareEnvelope ]
            [ span [ class "seal-wax", attribute "aria-hidden" "true" ]
                [ span [ class "sprig-on-wax" ] [] ]
            , span [ class "seal-caption" ] [ text "Seal & send" ]
            ]
        ]


inboxPage : Model -> Html Msg
inboxPage model =
    div []
        [ h1 [] [ text "Inbox" ]
        , p [ class "lede" ] [ text "Sealed letters wait here until their day." ]
        , if List.isEmpty model.sealed && List.isEmpty model.inbox then
            p [ class "quiet" ] [ text "No letters yet. When one arrives, it waits here with its seal until the day you chose." ]
          else
            text ""
        , div [ class "stack" ]
            (List.map (sealedCard model) model.sealed)
        , div [ class "stack" ]
            (List.map (openedLetter model.zone) model.inbox)
        ]


sealedCard : Model -> SealedLetter -> Html Msg
sealedCard model letter =
    let
        known =
            namedContact model.contacts letter.from

        sender =
            known |> Maybe.withDefault "A friend"

        opening =
            model.openingKey == letter.raw
    in
    div [ class ("card letter-card" ++ (if opening then " is-opening" else "")) ]
        [ span [ class "wax-dot", attribute "aria-hidden" "true" ] []
        , p [ class "eyebrow" ] [ text "Sealed" ]
        , h2 [] [ text ("From " ++ sender) ]
        , if known == Nothing && letter.from /= "" then
            p [ class "meta" ] [ text (shortAddress letter.from) ]
          else
            text ""
        , p [ class "meta" ] [ text (opensOn model.zone model.now letter.releaseRound) ]
        , if opening then
            p [ class "lede" ] [ text "The seal gives way." ]
          else
            text ""
        , div [ class "row" ]
            [ button
                [ type_ "button"
                , class "btn btn-primary"
                , disabled opening
                , onClick (OpenSealed letter.raw)
                ]
                [ text
                    (if opening then
                        "Opening…"
                     else
                        "Open"
                    )
                ]
            ]
        ]


openedLetter : Time.Zone -> Letter -> Html Msg
openedLetter zone letter =
    div [ class "card" ]
        [ h2 [] [ text (if letter.subject == "" then "A letter" else letter.subject) ]
        , p [ class "meta" ] [ text ("From " ++ (if letter.from == "" then "A friend" else letter.from)) ]
        , p [ class "meta" ]
            [ text
                (humanWhen zone
                    (if letter.sentAt /= "" then
                        letter.sentAt
                     else
                        letter.receivedAt
                    )
                )
            ]
        , p [ class "letter-text" ] [ text letter.body ]
        ]


outboxPage : Model -> Html Msg
outboxPage model =
    div []
        [ h1 [] [ text "Outbox" ]
        , p [ class "lede" ] [ text "Letters stay here until they reach your friend." ]
        , if List.isEmpty model.outbox then
            p [ class "quiet" ] [ text "Nothing is waiting to go out." ]
          else
            div [ class "stack" ] (List.map (outboxItem model.zone) model.outbox)
        , if List.isEmpty model.outbox then
            text ""
          else
            div [ class "row" ]
                [ button [ type_ "button", class "btn btn-ghost", onClick RequestOutboxArchive ] [ text "Archive outbox" ]
                ]
        , p [ class "meta" ] [ text ("Archived: " ++ String.fromInt (List.length model.archivedOutbox)) ]
        , div [ class "stack" ] (List.map archivedOutbox model.archivedOutbox)
        ]


outboxItem : Time.Zone -> OutboxItem -> Html Msg
outboxItem zone item =
    div [ class "card" ]
        [ div [ class "row" ]
            [ h2 [] [ text item.subject ]
            , span [ class "pill" ] [ text (deliveryLabel item.status) ]
            ]
        , p [ class "meta" ]
            [ text
                ("To "
                    ++ (if item.recipientName /= "" then
                            item.recipientName
                        else
                            shortAddress item.recipient
                       )
                )
            ]
        , p [ class "meta" ] [ text (humanWhen zone item.createdAt) ]
        , if item.error == "" then
            text ""
          else
            p [ class "field-error" ] [ text item.error ]
        , if item.status == "failed" || item.status == "pending" then
            button [ type_ "button", class "btn btn-ghost", onClick (RetryEnvelope item.id) ] [ text "Retry" ]
          else
            text ""
        ]


archivedOutbox : OutboxItem -> Html Msg
archivedOutbox item =
    div [ class "card" ]
        [ p [] [ text item.subject ]
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-ghost", onClick (RestoreOutbox item.id) ] [ text "Restore" ]
            , button [ type_ "button", class "btn btn-ghost", onClick (DeleteArchivedOutbox item.id) ] [ text "Delete" ]
            ]
        ]


sentPage : Model -> Html Msg
sentPage model =
    div []
        [ h1 [] [ text "Letters you sent" ]
        , p [ class "lede" ] [ text "A copy stays on this desk, whether or not it has arrived." ]
        , if List.isEmpty model.sent then
            p [ class "quiet" ] [ text "When you seal a letter, the full text remains here." ]
          else
            div [ class "stack" ] (List.map (sentLetter model.zone) model.sent)
        , if List.isEmpty model.sent then
            text ""
          else
            div [ class "row" ]
                [ button [ type_ "button", class "btn btn-ghost", onClick RequestSentArchive ] [ text "Archive sent letters" ]
                ]
        , p [ class "meta" ] [ text ("Archived: " ++ String.fromInt (List.length model.archivedSent)) ]
        , div [ class "stack" ] (List.map archivedSent model.archivedSent)
        ]


sentLetter : Time.Zone -> SentLetter -> Html Msg
sentLetter zone letter =
    div [ class "card" ]
        [ div [ class "row" ]
            [ h2 [] [ text letter.subject ]
            , span [ class "pill" ] [ text (deliveryLabel letter.status) ]
            ]
        , p [ class "meta" ] [ text ("To " ++ shortAddress letter.to) ]
        , p [ class "meta" ]
            [ text
                (humanWhen zone
                    (if letter.sentAtLocal /= "" then
                        letter.sentAtLocal
                     else
                        letter.sentAt
                    )
                )
            ]
        , p [ class "letter-text" ] [ text letter.body ]
        ]


archivedSent : SentLetter -> Html Msg
archivedSent letter =
    div [ class "card" ]
        [ p [] [ text letter.subject ]
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-ghost", onClick (RestoreSent letter.id) ] [ text "Restore" ]
            , button [ type_ "button", class "btn btn-ghost", onClick (DeleteArchivedSent letter.id) ] [ text "Delete" ]
            ]
        ]


helpPage : Html Msg
helpPage =
    div [ class "card" ]
        [ h1 [] [ text "How letters open" ]
        , p [ class "lede" ] [ text "A letter stays sealed until the day you chose. Both of you need to be here to pass it across. Nothing waits on a server in between." ]
        , div [ class "stack" ]
            [ faq "How do I invite a friend?"
                "One of you creates an invitation and sends that text to the other. They choose Join a friend, paste it, and send an answer back. Paste that answer and choose Connect."
            , faq "When can a letter be read?"
                "Not before the day it was sealed for. The seal is a public time lock, so neither of you can open it early."
            , faq "Do we both need to be here?"
                "Yes. The letter passes directly between your two browsers. If it cannot cross yet, it waits in your outbox."
            , faq "Where do the letters live?"
                "On this device, in this browser. A backup file holds your desk's keys. Keep that file private."
            , faq "Does changing my name change my address?"
                "No. Your name is what a friend sees. The address stays with this browser until you restore a backup."
            ]
        , div [ class "row" ]
            [ button [ type_ "button", class "btn btn-ghost", onClick (Go Desk) ] [ text "Return to desk" ]
            ]
        ]


faq : String -> String -> Html Msg
faq question answer =
    details [ class "fold" ]
        [ summary [] [ text question ]
        , p [ class "quiet" ] [ text answer ]
        ]


confirmationDialog : String -> Html Msg
confirmationDialog action =
    div [ class "dialog-backdrop", attribute "role" "presentation" ]
        [ div
            [ class "dialog-card"
            , attribute "role" "dialog"
            , attribute "aria-modal" "true"
            , attribute "aria-labelledby" "confirm-title"
            ]
            [ h2 [ id "confirm-title" ]
                [ text
                    (case action of
                        "restore-identity" ->
                            "Restore this desk?"

                        "archive-outbox" ->
                            "Archive the outbox?"

                        "archive-sent" ->
                            "Archive sent letters?"

                        _ ->
                            "Continue?"
                    )
                ]
            , p [ class "lede" ]
                [ text
                    (case action of
                        "restore-identity" ->
                            "This replaces the keys on this desk. Keep a backup somewhere safe."

                        "archive-outbox" ->
                            "These letters move into the archive on this device."

                        "archive-sent" ->
                            "These copies move into the archive on this device."

                        _ ->
                            "Continue with this?"
                    )
                ]
            , div [ class "row" ]
                [ button [ type_ "button", class "btn btn-ghost", onClick CancelConfirmation ] [ text "Cancel" ]
                , button [ type_ "button", class "btn btn-primary", onClick ConfirmAction ] [ text "Confirm" ]
                ]
            ]
        ]


navButton : String -> Bool -> Msg -> Html Msg
navButton label current msg =
    button
        ([ type_ "button", class "nav-btn", onClick msg ]
            ++ (if current then
                    [ attribute "aria-current" "page" ]
                else
                    []
               )
        )
        [ text label ]


moreMenu : Model -> Html Msg
moreMenu model =
    let
        current =
            model.page == Outbox || model.page == Sent || model.page == Help
    in
    div [ class "more-menu" ]
        [ button
            ([ type_ "button"
             , class "nav-btn"
             , attribute "aria-expanded" (boolAttr model.moreOpen)
             , attribute "aria-controls" "more-panel"
             , onClick ToggleMore
             ]
                ++ (if current then
                        [ attribute "aria-current" "page" ]
                    else
                        []
                   )
            )
            [ text "More" ]
        , if model.moreOpen then
            div [ class "more-panel", id "more-panel" ]
                [ navButton ("Outbox (" ++ String.fromInt (List.length model.outbox) ++ ")") (model.page == Outbox) (Go Outbox)
                , navButton ("Sent (" ++ String.fromInt (List.length model.sent) ++ ")") (model.page == Sent) (Go Sent)
                , navButton "Help" (model.page == Help) (Go Help)
                ]
          else
            text ""
        ]


themeButton : Model -> Html Msg
themeButton model =
    button [ type_ "button", class "btn btn-ghost theme-btn", onClick ToggleTheme ]
        [ text
            (if model.theme == "dark" then
                "Light"
             else
                "Dark"
            )
        ]


noticeView : Maybe Notice -> Html Msg
noticeView maybeNotice =
    div [ class "notice-slot", attribute "aria-live" "polite" ]
        [ case maybeNotice of
            Nothing ->
                text ""

            Just note ->
                div
                    [ class ("notice notice-" ++ toneName note.tone)
                    , attribute "role"
                        (if note.tone == Error then
                            "alert"
                         else
                            "status"
                        )
                    ]
                    [ p [] [ text note.text ]
                    , button [ type_ "button", class "btn", onClick DismissNotice ] [ text "Dismiss" ]
                    ]
        ]


choiceButton : String -> Bool -> Msg -> Html Msg
choiceButton label pressed msg =
    button
        [ type_ "button"
        , class "choice"
        , attribute "aria-pressed" (boolAttr pressed)
        , onClick msg
        ]
        [ text label ]


contactChip : Contact -> Html Msg
contactChip contact =
    button [ type_ "button", class "btn btn-ghost chip", onClick (SelectContact contact.address) ]
        [ text contact.name ]


fieldError : String -> String -> Html msg
fieldError errorId message =
    if message == "" then
        text ""
    else
        p [ class "field-error", id errorId, attribute "role" "alert" ] [ text message ]


described : String -> String -> List (Html.Attribute msg)
described errorId message =
    if message == "" then
        []
    else
        [ attribute "aria-describedby" errorId
        , attribute "aria-invalid" "true"
        ]


boolAttr : Bool -> String
boolAttr flag =
    if flag then
        "true"
    else
        "false"


toneName : NoticeTone -> String
toneName tone =
    case tone of
        Success ->
            "success"

        Error ->
            "error"

        Info ->
            "info"


problems : Model -> Problems
problems model =
    let
        address =
            String.trim model.recipient
    in
    { recipient =
        if address == "" then
            "Add your friend's letter address."
        else if not (looseAddress address) then
            "That letter address does not look right."
        else
            ""
    , subject =
        if String.trim model.subject == "" then
            "Give the letter a subject."
        else
            ""
    , body =
        if String.trim model.body == "" then
            "Write a few lines before sealing."
        else
            ""
    }


hasProblems : Problems -> Bool
hasProblems found =
    found.recipient /= "" || found.subject /= "" || found.body /= ""


looseAddress : String -> Bool
looseAddress address =
    String.startsWith "owl1" address && String.length address > 20


effectiveChoice : Model -> ReleaseChoice
effectiveChoice model =
    case model.releaseChoice of
        TestSecond ->
            if model.dev then
                TestSecond
            else
                TomorrowMorning

        other ->
            other


choiceKey : ReleaseChoice -> String
choiceKey choice =
    case choice of
        TomorrowMorning ->
            "tomorrow"

        FewDays ->
            "few-days"

        NextWeek ->
            "next-week"

        CustomDay date ->
            "date:" ++ date

        TestSecond ->
            "test-second"


choiceHours : ReleaseChoice -> String
choiceHours choice =
    case choice of
        FewDays ->
            "72"

        NextWeek ->
            "168"

        TestSecond ->
            "0"

        _ ->
            "24"


choiceSeconds : ReleaseChoice -> String
choiceSeconds choice =
    case choice of
        TestSecond ->
            "1"

        _ ->
            "0"


storedToChoice : String -> String -> String -> ReleaseChoice
storedToChoice choice hours seconds =
    if choice == "test-second" || seconds == "1" then
        TestSecond
    else if choice == "few-days" || (choice == "" && hours == "72") then
        FewDays
    else if choice == "next-week" || (choice == "" && hours == "168") then
        NextWeek
    else if String.startsWith "date:" choice then
        CustomDay (String.dropLeft 5 choice)
    else
        TomorrowMorning


coerceChoice : Bool -> ReleaseChoice -> ReleaseChoice
coerceChoice dev choice =
    case choice of
        TestSecond ->
            if dev then
                TestSecond
            else
                TomorrowMorning

        other ->
            other


isCustom : ReleaseChoice -> Bool
isCustom choice =
    case choice of
        CustomDay _ ->
            True

        _ ->
            False


customDate : ReleaseChoice -> String
customDate choice =
    case choice of
        CustomDay date ->
            date

        _ ->
            ""


releaseDelay : Time.Zone -> Time.Posix -> ReleaseChoice -> Result String Delay
releaseDelay zone now choice =
    case choice of
        TomorrowMorning ->
            Ok { hours = hoursUntilNextMorning zone now, seconds = 0 }

        FewDays ->
            Ok { hours = 72, seconds = 0 }

        NextWeek ->
            Ok { hours = 168, seconds = 0 }

        TestSecond ->
            Ok { hours = 0, seconds = 1 }

        CustomDay date ->
            Result.map (\hours -> { hours = hours, seconds = 0 }) (hoursUntilDate zone now date)


hoursUntilNextMorning : Time.Zone -> Time.Posix -> Float
hoursUntilNextMorning zone now =
    let
        elapsed =
            Time.toHour zone now * 3600 + Time.toMinute zone now * 60 + Time.toSecond zone now
    in
    toFloat (86400 - elapsed + 8 * 3600) / 3600


hoursUntilDate : Time.Zone -> Time.Posix -> String -> Result String Float
hoursUntilDate zone now raw =
    case parseDate raw of
        Nothing ->
            Err "Choose a date."

        Just ( year, month, day ) ->
            let
                todayNum =
                    civilDay zone now

                targetNum =
                    daysFromCivil year month day

                diff =
                    targetNum - todayNum

                elapsed =
                    Time.toHour zone now * 3600 + Time.toMinute zone now * 60 + Time.toSecond zone now

                seconds =
                    diff * 86400 - elapsed + 8 * 3600
            in
            if diff < 1 then
                Err "Choose a later day."
            else
                Ok (toFloat seconds / 3600)


normalizeStatus : String -> String -> String
normalizeStatus previous raw =
    case raw of
        "disconnected" ->
            "Disconnected"

        "closed" ->
            "Disconnected"

        "new" ->
            if previous == "" then
                "Disconnected"
            else
                previous

        "connected" ->
            "Connected"

        "connecting" ->
            "Connecting…"

        "failed" ->
            "Could not connect"

        "waiting-for-answer" ->
            "Waiting for your friend…"

        "waiting-for-peer" ->
            "Waiting for your friend…"

        _ ->
            raw


statusState : String -> String
statusState status =
    case status of
        "Connected" ->
            "connected"

        "Waiting for your friend…" ->
            "waiting"

        "Connecting…" ->
            "waiting"

        "Could not connect" ->
            "error"

        _ ->
            "idle"


deliveryLabel : String -> String
deliveryLabel status =
    case status of
        "failed" ->
            "Not delivered"

        "pending" ->
            "Waiting to send"

        "sent" ->
            "Delivered"

        other ->
            other


greeting : Time.Zone -> Time.Posix -> String -> String
greeting zone now name =
    let
        hour =
            Time.toHour zone now

        hello =
            if hour < 12 then
                "Good morning"
            else if hour < 17 then
                "Good afternoon"
            else if hour < 21 then
                "Good evening"
            else
                "Good night"
    in
    hello ++ ", " ++ name


sealedSentence : Int -> String
sealedSentence count =
    case count of
        0 ->
            "Nothing is sealed right now."

        1 ->
            "1 letter is sealed."

        _ ->
            String.fromInt count ++ " letters are sealed."


waitingSentence : Int -> String
waitingSentence count =
    case count of
        1 ->
            "1 letter is waiting to go out."

        _ ->
            String.fromInt count ++ " letters are waiting to go out."


namedContact : List Contact -> String -> Maybe String
namedContact contacts address =
    contacts
        |> List.filter (\contact -> contact.address == address)
        |> List.head
        |> Maybe.map .name


shortAddress : String -> String
shortAddress address =
    if address == "" then
        "A friend"
    else if String.length address <= 18 then
        address
    else
        String.left 8 address ++ "…" ++ String.right 4 address


opensOn : Time.Zone -> Time.Posix -> Int -> String
opensOn zone now round =
    if round < 1 then
        "Opens on its day"
    else
        let
            opensMs =
                1692803367 * 1000 + (round - 1) * 3000

            opens =
                Time.millisToPosix opensMs

            diff =
                civilDay zone opens - civilDay zone now
        in
        if opensMs <= Time.posixToMillis now then
            "Ready to open"
        else if diff <= 0 then
            "Opens today"
        else if diff == 1 then
            "Opens tomorrow"
        else if diff < 7 then
            "Opens " ++ weekdayName (Time.toWeekday zone opens)
        else
            "Opens " ++ formatDate zone opens


humanWhen : Time.Zone -> String -> String
humanWhen zone raw =
    case parseIso raw of
        Just time ->
            formatWhen zone time

        Nothing ->
            if raw == "" then
                "Undated"
            else
                raw


formatDate : Time.Zone -> Time.Posix -> String
formatDate zone time =
    weekdayName (Time.toWeekday zone time)
        ++ " "
        ++ String.fromInt (Time.toDay zone time)
        ++ " "
        ++ monthName (Time.toMonth zone time)
        ++ " "
        ++ String.fromInt (Time.toYear zone time)


formatWhen : Time.Zone -> Time.Posix -> String
formatWhen zone time =
    formatDate zone time
        ++ " at "
        ++ String.padLeft 2 '0' (String.fromInt (Time.toHour zone time))
        ++ ":"
        ++ String.padLeft 2 '0' (String.fromInt (Time.toMinute zone time))


parseIso : String -> Maybe Time.Posix
parseIso raw =
    let
        trimmed =
            String.left 19 raw
    in
    case String.split "T" trimmed of
        [ date, time ] ->
            case ( parseDate date, String.split ":" time ) of
                ( Just ( year, month, day ), [ hours, minutes, seconds ] ) ->
                    Maybe.map3
                        (\hour minute second ->
                            Time.millisToPosix
                                (daysFromCivil year month day * 86400000 + hour * 3600000 + minute * 60000 + second * 1000)
                        )
                        (String.toInt hours)
                        (String.toInt minutes)
                        (String.toInt (String.left 2 seconds))

                _ ->
                    Nothing

        _ ->
            Nothing


parseDate : String -> Maybe ( Int, Int, Int )
parseDate value =
    case String.split "-" value of
        [ years, months, days ] ->
            Maybe.map3 (\year month day -> ( year, month, day ))
                (String.toInt years)
                (String.toInt months)
                (String.toInt days)

        _ ->
            Nothing


civilDay : Time.Zone -> Time.Posix -> Int
civilDay zone time =
    daysFromCivil (Time.toYear zone time) (monthNumber (Time.toMonth zone time)) (Time.toDay zone time)


daysFromCivil : Int -> Int -> Int -> Int
daysFromCivil year month day =
    let
        y =
            if month <= 2 then
                year - 1
            else
                year

        era =
            if y >= 0 then
                y // 400
            else
                (y - 399) // 400

        yoe =
            y - era * 400

        monthAdj =
            if month > 2 then
                month - 3
            else
                month + 9

        dayOfYear =
            (153 * monthAdj + 2) // 5 + day - 1

        dayOfEra =
            yoe * 365 + (yoe // 4) - (yoe // 100) + dayOfYear
    in
    era * 146097 + dayOfEra - 719468


monthNumber : Time.Month -> Int
monthNumber month =
    case month of
        Time.Jan ->
            1

        Time.Feb ->
            2

        Time.Mar ->
            3

        Time.Apr ->
            4

        Time.May ->
            5

        Time.Jun ->
            6

        Time.Jul ->
            7

        Time.Aug ->
            8

        Time.Sep ->
            9

        Time.Oct ->
            10

        Time.Nov ->
            11

        Time.Dec ->
            12


monthName : Time.Month -> String
monthName month =
    case month of
        Time.Jan ->
            "January"

        Time.Feb ->
            "February"

        Time.Mar ->
            "March"

        Time.Apr ->
            "April"

        Time.May ->
            "May"

        Time.Jun ->
            "June"

        Time.Jul ->
            "July"

        Time.Aug ->
            "August"

        Time.Sep ->
            "September"

        Time.Oct ->
            "October"

        Time.Nov ->
            "November"

        Time.Dec ->
            "December"


weekdayName : Time.Weekday -> String
weekdayName day =
    case day of
        Time.Mon ->
            "Monday"

        Time.Tue ->
            "Tuesday"

        Time.Wed ->
            "Wednesday"

        Time.Thu ->
            "Thursday"

        Time.Fri ->
            "Friday"

        Time.Sat ->
            "Saturday"

        Time.Sun ->
            "Sunday"


hashFor : Page -> String
hashFor page =
    case page of
        Desk ->
            "#desk"

        Compose ->
            "#write"

        Inbox ->
            "#inbox"

        Pair ->
            "#pair"

        Outbox ->
            "#outbox"

        Sent ->
            "#sent"

        Help ->
            "#help"


pageFromHash : String -> Page
pageFromHash location =
    if String.contains "#help" location then
        Help
    else if String.contains "#outbox" location then
        Outbox
    else if String.contains "#sent" location then
        Sent
    else if String.contains "#compose" location || String.contains "#write" location then
        Compose
    else if String.contains "#inbox" location then
        Inbox
    else if String.contains "#owl" location || String.contains "#pair" location then
        Pair
    else
        Desk


letterDecoder : D.Decoder Letter
letterDecoder =
    D.map7 Letter
        (D.field "id" D.string)
        (D.field "from" D.string)
        (D.field "subject" D.string)
        (D.field "body" D.string)
        (D.field "releaseRound" D.int)
        (D.field "sentAt" D.string)
        (D.oneOf [ D.field "receivedAt" D.string, D.succeed "" ])


decodeSealed : String -> SealedLetter
decodeSealed raw =
    case
        D.decodeString
            (D.map3 (\fromAddress round received -> SealedLetter raw fromAddress round received)
                (D.oneOf [ D.field "from" D.string, D.succeed "" ])
                (D.oneOf [ D.field "releaseRound" D.int, D.succeed 0 ])
                (D.oneOf [ D.field "receivedAt" D.string, D.succeed "" ])
            )
            raw
    of
        Ok letter ->
            letter

        Err _ ->
            SealedLetter raw "" 0 ""


stateDecoder : D.Decoder LoadedState
stateDecoder =
    D.map8 LoadedState
        (D.field "contacts" (D.list contactDecoder))
        (D.field "drafts" (D.list draftDecoder))
        (D.field "sealed" (D.list D.string))
        (D.field "opened" (D.list letterDecoder))
        (D.field "outbox" (D.list outboxDecoder))
        (D.field "sent" (D.list sentDecoder))
        (D.field "archivedOutbox" (D.list outboxDecoder))
        (D.field "archivedSent" (D.list sentDecoder))


type alias LoadedState =
    { contacts : List Contact
    , drafts : List Draft
    , sealed : List String
    , inbox : List Letter
    , outbox : List OutboxItem
    , sent : List SentLetter
    , archivedOutbox : List OutboxItem
    , archivedSent : List SentLetter
    }


contactDecoder : D.Decoder Contact
contactDecoder =
    D.map2 Contact
        (D.field "name" D.string)
        (D.field "address" D.string)


draftDecoder : D.Decoder Draft
draftDecoder =
    D.map6 Draft
        (D.field "recipient" D.string)
        (D.field "subject" D.string)
        (D.field "body" D.string)
        (D.field "releaseHours" D.string)
        (D.field "releaseSeconds" D.string)
        (D.oneOf [ D.field "releaseChoice" D.string, D.succeed "" ])


outboxDecoder : D.Decoder OutboxItem
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


sentDecoder : D.Decoder SentLetter
sentDecoder =
    D.map8 SentLetter
        (D.field "id" D.string)
        (D.field "to" D.string)
        (D.field "subject" D.string)
        (D.field "body" D.string)
        (D.field "releaseRound" D.int)
        (D.field "sentAt" D.string)
        (D.field "status" D.string)
        (D.oneOf [ D.field "sentAtLocal" D.string, D.succeed "" ])

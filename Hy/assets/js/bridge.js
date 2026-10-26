var init = function () {
    if (window.jsb) return;
    window.jsb = function () {
        var cbs = {};
        var listeners = {};
        var subscriptions = {};
        var eventBus = {};
        var loaded = false;
        var _callback_count = 1000;
        const _CALLBACK_ID = 'callback_id';
        const _EVENT_ID = 'event_id';
        const _PARAMS = 'params';
        const _MESSAGE_TYPE = 'message_type';
        const _EVENTBUS_PREFFIX_ = 'eventBus.';

        var inPageEventBusNotify = function(eventName, extraData) {
            var fullname = _EVENTBUS_PREFFIX_+eventName;
            if (eventBus[fullname]) {
                for (var i in eventBus[fullname]) {
                    cbInfo = eventBus[fullname][i];
                    cbInfo.cb({name:eventName, eventData: cbInfo.data, extraData: extraData});
                }

                eventBus[fullname] = eventBus[fullname].filter(function (cbInfo, index, array) {
                    return !cbInfo.once;
                })
            }
        };

        return {
            invoke: function (a, b, c) {
                if (a === 'preVerifyJSAPI') {
                    c({"errMsg": "config:ok"});
                } else if (a === 'eventBusTrigger') {
                    b.name = _EVENTBUS_PREFFIX_+ b.name;
                    JsRuntime.invoke(a, JSON.stringify(b),"");
                } else if (a === 'eventBusDetach') {
                    var fullname = _EVENTBUS_PREFFIX_+b.name;

                    if (b.cb && eventBus[fullname]) {
                        eventBus[fullname] = eventBus[fullname].filter(function (cbInfo, index, array) {
                            return cbInfo.cb !== b.cb;
                        })
                    } else {
                        eventBus[fullname] = [];
                    }
                } else {
                    var callbackId = (_callback_count++).toString();
                    cbs[callbackId] = c;

                    JsRuntime.invoke(a, JSON.stringify(b),callbackId);
                }
            },
            on: function (a, b, e, o) {
                if (a.startsWith(_EVENTBUS_PREFFIX_)) {
                    if (eventBus[a]) {
                        eventBus[a].push({cb:b, data:e, once:o});
                    } else {
                        eventBus[a] = [{cb:b, data:e, once:o}];
                    }
                    return
                }
                listeners[a] = b;

                JsRuntime.registerEvent(a);
            },
            onEvent: function (a, b, e) {
                if (subscriptions[a]) {
                    subscriptions[a].push({cb:b, data:e});
                } else {
                    subscriptions[a] = [{cb:b, data:e}];
                }
                this.invoke('Common.subscribeEvent', {event: a, params: e || {}}, {});
            },
            offEvent: function (a, b) {
                if (subscriptions[a]) {
                    subscriptions[a] = subscriptions[a].filter(
                        it => it.cb !== b
                    );
                    if (subscriptions[a].length === 0) {
                        delete subscriptions[a];
                    }
                    this.invoke("Common.unsubscribeEvent", {event: a}, {});
                }
            },
            init: function () {
                if (loaded) return;
                var ourJSBridgeReadyEvent = new Event("JSBridgeReady");
                document.dispatchEvent(ourJSBridgeReadyEvent);

                loaded = true;
            },
            log: function(info){
                invoke("log",{"log":  info},{});
            },


            handleMessage: function (message) {
                switch (message[_MESSAGE_TYPE]) {
                    case 'checkRegister':

                        break;
                    case 'callback':
                        const callbackId = message[_CALLBACK_ID];

                        if (typeof callbackId === 'string' && typeof cbs[callbackId] === 'function') {
                            cbs[callbackId](message[_PARAMS]);
                            delete cbs[callbackId];
                        }
                        break;
                    case 'event': {
                        if (typeof message[_EVENT_ID] === 'string') {
                            const eventId = message[_EVENT_ID];
                            if (eventId.startsWith(_EVENTBUS_PREFFIX_)) {
                                var shortName = eventId.substr(_EVENTBUS_PREFFIX_.length);
                                inPageEventBusNotify(shortName, message[_PARAMS]);
                            } else if (typeof listeners[eventId] === 'function') {
                                listeners[eventId](message[_PARAMS]);
                            } else {
                                console.log("listener not function");
                            }
                        }
                    }
                    case 'event_v2': {
                        const eventName = message[_EVENT_ID];
                        const eventData = message[_PARAMS];
                        if (typeof eventName === 'string' && subscriptions[eventName]) {
                            subscriptions[eventName].forEach(it => {
                                if (typeof it.cb === 'function') {
                                    it.cb(eventData, it.data);
                                }
                            });
                        }
                        break;
                    }
                        break;
                }

            },

            focusElement: function (element) {
                document.getElementById(element).focus()
            }
        }
    }();

    jsb.init();
};

"complete" === document.readyState ? init() : window.addEventListener("load", init);



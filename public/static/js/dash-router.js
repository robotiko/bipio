define([
  'underscore',
  'backbone',
  'views/bip/v_bip_list',
  'views/bip/v_bip_modal',
  'views/channel/v_channel_list',
  'views/channel/v_channel_pod_list',
  'views/outbox/v_outbox',
  'bipclient',
  'moment'
  ], function(_, Backbone, BipListView, BipModalView, ChannelListView, PodListView, OutboxView, BipClient) {
    var AppRouter = Backbone.Router.extend({
      routes: {
        // Default
        'bips' : 'bipRender',
        'bips/:id' : 'bipRender',
        'bips/:id/:mode/:child_id' : 'bipRender',
        'bips/:id/:mode' : 'bipRender',

        'channels' : 'channelRender',
        'channels/:id' : 'channelRender',

        'outbox' : 'outboxRender',
        '*actions': 'channelRender'
      }
    });

    var app_router,
      currentView;


    var initialize = function() {
      
      $('#loader-wrapper').fadeOut(function() {
        $(this).remove();
      });

      app_router = new AppRouter;

      var mailChannels = BipClient.getCollection('channel').where({ action : 'email.smtp_forward'});

      var containerWidth = $('#page-body .container').width();

      var appContent = $('#app-content');
      var markAction = function(action) {
        $("[id^=init-]").removeClass('active');
        $('#init-' + action).addClass('active');
      }

      var initLayout = function(action, params) {
        var tplHTML = _.template($('#tpl-layouts-' + action).html());
        appContent.html(tplHTML(params || {}));
      }

      var destroyView = function() {
        if (currentView && currentView.shutdown) {
          currentView.shutdown();
        }
      }

      app_router.on('route:bipRender', function (id, mode, childId) {
        destroyView();
        
        $('#page-body .container').removeAttr('style');
        // set explicit action for this default route
        var action = 'bips';

        initLayout(action, {
          emitters : BipClient.getCollection('channel').getEmitters()
        } );
        markAction(action);

        var bipListView = new BipListView(appContent, app_router);
        bipListView.render(id, mode, childId);
        currentView = bipListView;
      });

      app_router.on('route:outboxRender', function (id, mode, childId) {
        destroyView();
        
        $('#page-body .container').removeAttr('style');
        // set explicit action for this default route
        var action = 'outbox';

        initLayout(action);
        markAction(action);

        var outboxView = new OutboxView(appContent, app_router);
        outboxView.render();
        
        currentView = outboxView;
      });

      app_router.on('route:channelRender', function (id) {
        destroyView();
        
        $('#page-body .container').removeAttr('style');
        var action = 'channels';
        initLayout(action);
        markAction(action);

        var channelsView = new ChannelListView(appContent, app_router);
        var podsView = new PodListView(appContent, app_router);

        podsView.on('podSelected', function(args) {
          var filter, channel;
          if (args) {
            var pod = args.pod,
            channel = args.channel;

            if (pod) {
              filter = {
                attr : 'action',
                match: new RegExp('^' + pod.id)
              };
              channelsView.resetPage();
            }
          }
          channelsView.updateFilter(filter, channel);
        });

        channelsView.render();
        
        currentView = channelsView;
        
        podsView.render(id);

      });

      Backbone.history.start();
     
      app_router.navigate('channels', {
        trigger : true
      } );
     
      // global config tray
      $('#app-settings-container').on('click', function() {
        var pb = $('body');
        if (!pb.hasClass('tray-open')) {
          pb.addClass('tray-open');
        } else {
          pb.removeClass('tray-open');
        }
      });
    };

    return {
      initialize: initialize
    };
  });
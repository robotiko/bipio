define([
  'underscore',
  'backbone',
  'views/bip/v_bip_list',
  'views/bip/v_bip_modal',
  'views/channel/v_channel_list',
  'views/channel/v_channel_pod_list',
  'bipclient',
  'moment'
  ], function(_, Backbone, BipListView, BipModalView, ChannelListView, PodListView, BipClient) {
    
    var currentView,
      mailChannels = BipClient.getCollection('channel').where({ action : 'email.smtp_forward'}),
      containerWidth = $('#page-body .container').width(),
      appContent = $('#app-content'),
      markAction = function(action) {
        $("[id^=init-]").removeClass('active');
        $('#init-' + action).addClass('active');
      },    
      initLayout = function(action, params) {
        var tplHTML = _.template($('#tpl-layouts-' + action).html());
        appContent.html(tplHTML(params || {}));
      },
      destroyView = function() {
        if (currentView && currentView.shutdown) {
          currentView.shutdown();
        }
      },      
      app_router,
      AppRouter = Backbone.Router.extend({
      routes: {
        // Default
        'bips' : 'bipRender',
        'bips/:id' : 'bipRender',
        'bips/:id/:mode/:child_id' : 'bipRender',
        'bips/:id/:mode' : 'bipRender',

        'channels' : 'channelRender',
        'channels/:id' : 'channelRender',

        '*actions': 'channelRender'
      },
      bipRender : function (id, mode, childId) {
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
      },
      channelRender : function (id) {
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
      }
    });
    
    app_router = new AppRouter();
    
    Backbone.history.start();
    
    // global config tray
    $('#app-settings-container').on('click', function() {
      var pb = $('body');
      if (!pb.hasClass('tray-open')) {
        pb.addClass('tray-open');
      } else {
        pb.removeClass('tray-open');
      }
    });
    
    $('#loader-wrapper').fadeOut(function() {
      $(this).remove();
    });

  });
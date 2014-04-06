define([
  'underscore',
  'backbone',
  'views/bip/v_bip_list',
  'views/bip/v_bip_modal',
  'views/channel/v_channel_list',
  'views/channel/v_channel_pod_list',
  'views/feed/v_feed_list',
  'views/outbox/v_outbox',
  'bipclient',
  'moment'
  ], function(_, Backbone, BipListView, BipModalView, ChannelListView, PodListView, FeedListView, OutboxView, BipClient) {
    var AppRouter = Backbone.Router.extend({
      routes: {
        // Default
        'bips' : 'bipRender',
        'bips/:id' : 'bipRender',
        'bips/:id/:mode/:child_id' : 'bipRender',
        'bips/:id/:mode' : 'bipRender',

        'channels' : 'channelRender',
        'channels/:id' : 'channelRender',

        'feeds' : 'feedRender',
        'feeds/filter/sub/:id' : 'feedRenderFiltered',
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

      var tour = BipClient._mounted ? {} : {
        id: "hello-bipio",
        steps: [
          {
            title: "Channels",
            content: "These are the building blocks for creating workflows, they're grouped into collections of services.<br/><br/>"
              + "To configure and enable a Channel, select a service icon. Some services may ask you for credentials to proceed through to setup",
            target: '.channel-cta',
            placement: "top",
            arrowOffset : 'center',
            width: 770
          },

          {
            title: "Enabled Channels",
            content: "A couple of useful Channels have already been created for you.<br/><br/>"
              + "<span class='label label-primary'>Public Feed</span> is the public content feed for your personal <span class='label label-primary'>https://" + BipClient.getCollection('domain').get(userSettings.bip_domain_id).get('name') + "</span> domain<br/><br/>"
              + "<span class='label label-primary'>" 
              + mailChannels.length > 0 ? mailChannels[0].get('name') : ''
              + "</span> is an email channel for forwarding messages to the email address you signed up with"
            ,
            target: '.channel-list-item',
            placement: "right",
            arrowOffset : 64,
            width: 770,
            onNext : function() {
              app_router.navigate('bips', {
                trigger : true
              });
            }
          },
          {
            title: "Bips",
            content: "Bips orchestrate the Channels you've created into workflows.<br/><br/>"
              + "<img src='/static/img/channels/32/color/bip_smtp.png'> Email bips can process email incoming to your <span class='label'>" + BipClient.getCollection('domain').get(userSettings.bip_domain_id).get('name') + "</span> domain<br/><br/>"
              + "<img src='/static/img/channels/32/color/bip_http.png'> Web Hooks can be used to serve data and process requests to <span class='label'>https://" + BipClient.getCollection('domain').get(userSettings.bip_domain_id).get('name') + "</span> from external web applications<br/><br/>"
              + "<img src='/static/img/channels/32/color/bip_trigger.png'> Triggers (not yet visible) let you detect and take action on certain channel events",              
            target: '.create-bip-buttons',
            placement : 'bottom',
            arrowOffset : 'left',
            width: 620,            
          },
          {
            target: '#init-outbox',
            title : "Outbox",
            content : "The Outbox is a quick way to send a messages to your connected services or test a workflow. I'm going to take you through setting up a simple Web Hook that the <span class='label'><i class='icon-edit'></i> Outbox</span> can use",
            placement : 'bottom',
            onNext : function() {
              app_router.navigate('bips/new/http', {
                trigger : true
              });            
            }
          },
          {
            target: '#bip_name',
            title : "Creating Your First Bip",
            content : "Bips don't always need names but I've set one up here just incase.  Feel free to change it if you like",
            placement : 'left',
            delay : 1000,
            onShow : function() {
              $('#bip_name').val('my-first-bip').trigger('keyup');
            }
          },
          {
            target: '.expiration',
            title : "Life Time",
            content : "Bips can automatically pause or disappear after a certain time or number of impressions (hits).  When these fields are empty, the Bip never expires",
            placement : 'left'
          },
          {
            target: '#hub',
            title : "Hub",
            content : "This is called the Hub, it's where the workflow for this Bip gets created.  Take a brief moment to check out the instructions to the right, and start creating the Hub when you're ready",
            placement : 'top',
            onShow : function() {
              var thisStepNum = hopscotch.getCurrStepNum();              
              $(document).on('hub-modal-channel', function(ev) {
                if (hopscotch.getCurrStepNum() === thisStepNum) {
                  ev.stopPropagation();
                  ev.preventDefault();
                  hopscotch.nextStep();
                }
              });
            },
            showNextButton : false
          },
          {
            target: 'a[data-channel-id="' 
              + (mailChannels.length > 0 ? mailChannels[0].get('id') : '') + '"]',
            title : "Available Actions",
            content : "Any available actions are shown here.  Select your Email channel to continue",
            placement : 'top',
            onShow : function() {
              $('a[data-channel-id="' + BipClient.getCollection('channel')
                .where({action : 'email.smtp_forward'})[0]
                .get('id') + '"]').on('click', function() {
                  hopscotch.nextStep();
                });
            },
            showNextButton : false
          },
          {
            target: '.modal-header',
            title : "Data Transformation",
            content : "When a message is received by a channel, it can be transformed in whatever way makes sense for you."
            + "The <span class='label'><i class='icon-edit'></i> Outbox</span> exports a Message Subject and HTML Message Body, so we'll use these attributes.<br/><br/>Click Save Action when you're ready",
            placement : 'left',
            onShow : function() {
              setTimeout(function() {
                $('.modal-confirm').on('click', function() {
                  hopscotch.nextStep();
                });
                
                $('.modal-close, .btn-reselect').on('click', function() {
                  hopscotch.endTour(true);
                });
              }, 1000);             
            },
            showNextButton : false
          },
          {
            target: '#bip-submit',
            title : "Almost Done!",
            content : "Use the <span class='label'><i class='icon-edit'></i> Outbox</span> to send a message to this Web Hook Bip once saved.  All going well you should"
             + " receive the message straight to your email inbox!",
            placement : 'top',
            onShow : function() {
              $('#bip-submit').on('click', function() {
                hopscotch.endTour(true);                   
              });
            }
          }          
        ]
      };

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

      function initFeedView(id, mode, childId) {
        // set explicit action for this default route
        var action = 'feeds';

        initLayout(action);
        markAction(action);

        var feedView = new FeedListView(appContent, app_router);
        feedView.render(id, mode, childId);
        
        currentView = feedView;
      }

      app_router.on('route:feedRender', function (id, mode, childId) {
        destroyView();
        initFeedView(id, mode, childId);      
      });

      app_router.on('route:feedRenderFiltered', function (id) {
        if (currentView && currentView.appID && 'feed_manager' === currentView.appID) {
          currentView.filterBipCID(id);
        }
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
        if ('tour' === id && Object.keys(tour).length) {
          setTimeout(function() {
            hopscotch.startTour(tour);
          }, 100);
          
          id = null;
        }
        
        currentView = channelsView;
        
        podsView.render(id);

      });

      Backbone.history.start();

      $('.greyified').removeClass('greyified');
      
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
import * as VideoUtils from '#core/dom/video';
import {Action, AmpStoryStoreService} from '../amp-story-store-service';
import {AmpAudio} from '../../../amp-audio/0.1/amp-audio';
import {AmpDocSingle} from '#service/ampdoc-impl';
import {AmpStoryPage, PageState, Selectors} from '../amp-story-page';
import {Deferred} from '#core/data-structures/promise';
import {LocalizationService} from '#service/localization';
import {MediaType} from '../media-pool';
import {Services} from '#service';
import {Signals} from '#core/data-structures/signals';
import {addAttributesToElement, createElementWithAttributes} from '#core/dom';
import {htmlFor} from '#core/dom/static-template';
import {installFriendlyIframeEmbed} from '../../../../src/friendly-iframe-embed';
import {registerServiceBuilder} from '../../../../src/service-helpers';
import {scopedQuerySelectorAll} from '#core/dom/query';
import {afterRenderPromise} from '#testing/helpers';

const extensions = ['amp-story:1.0', 'amp-audio'];

describes.realWin('amp-story-page', {amp: {extensions}}, (env) => {
  let win;
  let element;
  let html;
  let gridLayerEl;
  let page;
  let storeService;
  let isPerformanceTrackingOn;

  const nextTick = () => new Promise((resolve) => win.setTimeout(resolve, 0));

  beforeEach(() => {
    win = env.win;
    isPerformanceTrackingOn = false;

    html = htmlFor(win.document);

    const mediaPoolRoot = {
      getElement: () => win.document.createElement('div'),
      getMaxMediaElementCounts: () => ({
        [MediaType.VIDEO]: 8,
        [MediaType.AUDIO]: 8,
      }),
    };

    const localizationService = new LocalizationService(win.document.body);
    env.sandbox
      .stub(Services, 'localizationForDoc')
      .returns(localizationService);

    storeService = new AmpStoryStoreService(win);
    registerServiceBuilder(win, 'story-store', function () {
      return storeService;
    });

    registerServiceBuilder(win, 'performance', function () {
      return {
        isPerformanceTrackingOn: () => isPerformanceTrackingOn,
      };
    });

    const story = win.document.createElement('amp-story');
    story.getImpl = () => Promise.resolve(mediaPoolRoot);
    // Makes whenUpgradedToCustomElement() resolve immediately.
    story.createdCallback = Promise.resolve();

    element = win.document.createElement('amp-story-page');
    gridLayerEl = win.document.createElement('amp-story-grid-layer');
    element.getAmpDoc = () => new AmpDocSingle(win);
    const signals = new Signals();
    element.signals = () => signals;
    element.appendChild(gridLayerEl);
    story.appendChild(element);
    win.document.body.appendChild(story);

    page = new AmpStoryPage(element);
    env.sandbox.stub(page, 'mutateElement').callsFake((fn) => fn());
  });

  afterEach(() => {
    element.remove();
  });

  it('should build a page', async () => {
    page.buildCallback();
    return page.layoutCallback();
  });

  it('should not build the animation manager if no element is animated', async () => {
    page.buildCallback();
    await page.layoutCallback();
    expect(page.animationManager_).to.be.null;
  });

  it('should build the animation manager if an element is animated', async () => {
    const animatedEl = html`<div animate-in="fade-in"></div>`;

    element.appendChild(animatedEl);
    element.getAmpDoc = () => new AmpDocSingle(win);

    page.buildCallback();
    expect(page.animationManager_).to.exist;
  });

  it('should set an active attribute when state becomes active', async () => {
    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    expect(page.element).to.have.attribute('active');
  });

  function resolveSignals(element) {
    const deferred = new Deferred();
    element.signals = () => ({
      signal: () => {},
      whenSignal: () => deferred.promise,
    });
    deferred.resolve();
  }

  it('should start the advancement when state becomes active', async () => {
    page.registerAllMediaPromise_ = Promise.resolve();
    page.buildCallback();
    const advancementStartStub = env.sandbox.stub(page.advancement_, 'start');
    await page.layoutCallback();
    resolveSignals(page);
    page.setState(PageState.PLAYING);

    // Microtask tick
    await Promise.resolve();
    await Promise.resolve();

    expect(advancementStartStub).to.have.been.calledOnce;
  });

  it('should call waitForMedia after layoutCallback resolves', async () => {
    const spy = env.sandbox.spy(page, 'waitForMediaLayout_');
    page.buildCallback();
    await page.layoutCallback();
    expect(spy).to.have.been.calledOnce;
  });

  it('should mark page as loaded after media is loaded', async () => {
    const waitForMediaLayoutSpy = env.sandbox.spy(page, 'waitForMediaLayout_');
    const markPageAsLoadedSpy = env.sandbox.spy(page, 'markPageAsLoaded_');
    page.buildCallback();
    await page.layoutCallback();
    expect(markPageAsLoadedSpy).to.have.been.calledAfter(waitForMediaLayoutSpy);
  });

  it('should start the animations if needed when state becomes active', async () => {
    const animatedEl = html`<div animate-in="fade-in"></div>`;
    element.appendChild(animatedEl);

    page.buildCallback();
    await page.layoutCallback();
    const animateInStub = env.sandbox.stub(page.animationManager_, 'animateIn');

    page.setState(PageState.PLAYING);

    expect(animateInStub).to.have.been.calledOnce;
  });

  it('should perform media operations when state becomes active', (done) => {
    env.sandbox.stub(page, 'loadPromise').returns(Promise.resolve());

    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp3');
    gridLayerEl.appendChild(videoEl);

    let mediaPoolMock;

    page.buildCallback();
    page
      .layoutCallback()
      .then(() => page.mediaPoolPromise_)
      .then(async (mediaPool) => {
        mediaPoolMock = env.sandbox.mock(mediaPool);
        mediaPoolMock.expects('register').withExactArgs(videoEl).once();

        mediaPoolMock
          .expects('preload')
          .withExactArgs(videoEl)
          .returns(Promise.resolve())
          .once();

        mediaPoolMock.expects('play').withExactArgs(videoEl).once();

        page.setState(PageState.PLAYING);

        // `setState` runs code that creates subtasks (Promise callbacks).
        // Waits for the next frame to make sure all the subtasks are
        // already executed when we run the assertions.
        await afterRenderPromise();
        mediaPoolMock.verify();
        done();
      });
  });

  it('should unmute audio when state becomes active', (done) => {
    env.sandbox.stub(page, 'loadPromise').returns(Promise.resolve());

    storeService.dispatch(Action.TOGGLE_MUTED, false);

    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp3');
    gridLayerEl.appendChild(videoEl);

    let mediaPoolMock;

    page.buildCallback();
    page
      .layoutCallback()
      .then(() => page.mediaPoolPromise_)
      .then(async (mediaPool) => {
        mediaPoolMock = env.sandbox.mock(mediaPool);
        mediaPoolMock.expects('preload').resolves();
        mediaPoolMock.expects('play').resolves();
        mediaPoolMock.expects('unmute').once();

        page.setState(PageState.PLAYING);

        await afterRenderPromise();
        mediaPoolMock.verify();
        done();
      });
  });

  it('should perform media operations on fie video when active', (done) => {
    const iframe = win.document.createElement('iframe');
    const fiePromise = installFriendlyIframeEmbed(iframe, gridLayerEl, {
      url: 'https://amp.dev',
      html: '<video src="https://example.com/video.mp3"></video>',
      extensions: [],
    });
    env.sandbox.stub(page, 'loadPromise').returns(Promise.resolve());

    fiePromise.then((fie) => {
      const fieDoc = fie.win.document;
      const videoEl = fieDoc.querySelector('video');

      let mediaPoolMock;

      page.buildCallback();
      page
        .layoutCallback()
        .then(() => page.mediaPoolPromise_)
        .then(async (mediaPool) => {
          mediaPoolMock = env.sandbox.mock(mediaPool);
          mediaPoolMock.expects('register').withExactArgs(videoEl).once();

          mediaPoolMock
            .expects('preload')
            .withExactArgs(videoEl)
            .returns(Promise.resolve())
            .once();

          mediaPoolMock.expects('play').withExactArgs(videoEl).once();

          page.setState(PageState.PLAYING);

          // `setState` runs code that creates subtasks (Promise callbacks).
          // Waits for the next frame to make sure all the subtasks are
          // already executed when we run the assertions.
          await afterRenderPromise();
          mediaPoolMock.verify();
          done();
        });
    });
  });

  it('should build the background audio on layoutCallback', async () => {
    element.setAttribute('background-audio', 'foo.mp3');
    page.buildCallback();
    await page.layoutCallback();
    expect(
      scopedQuerySelectorAll(element, Selectors.ALL_PLAYBACK_MEDIA)[0].tagName
    ).to.equal('AUDIO');
  });

  it('should register the background audio on layoutCallback', async () => {
    element.setAttribute('background-audio', 'foo.mp3');
    page.buildCallback();
    const mediaPool = await page.mediaPoolPromise_;
    const mediaPoolRegister = env.sandbox.stub(mediaPool, 'register');
    await page.layoutCallback();

    page.setState(PageState.PLAYING);

    await nextTick();

    const audioEl = scopedQuerySelectorAll(
      element,
      Selectors.ALL_PLAYBACK_MEDIA
    )[0];
    expect(mediaPoolRegister).to.have.been.calledOnceWithExactly(audioEl);
  });

  it('should register amp-audio on layoutCallback', async () => {
    const ampAudioEl = win.document.createElement('amp-audio');
    addAttributesToElement(ampAudioEl, {
      'src': 'foo.mp3',
      'layout': 'nodisplay',
    });

    page.element.querySelector('amp-story-grid-layer').appendChild(ampAudioEl);

    new AmpAudio(ampAudioEl);
    ampAudioEl.buildInternal();
    page.buildCallback();

    const mediaPool = await page.mediaPoolPromise_;
    const mediaPoolRegister = env.sandbox.stub(mediaPool, 'register');
    env.sandbox.stub(mediaPool, 'preload');

    await page.layoutCallback();

    page.setState(PageState.PLAYING);

    await nextTick();

    const audioEl = scopedQuerySelectorAll(
      element,
      Selectors.ALL_PLAYBACK_MEDIA
    )[0];

    expect(mediaPoolRegister).to.have.been.calledOnceWithExactly(audioEl);
  });

  it('should preload the background audio on layoutCallback', async () => {
    element.setAttribute('background-audio', 'foo.mp3');
    page.buildCallback();
    const mediaPool = await page.mediaPoolPromise_;
    const mediaPoolPreload = env.sandbox.stub(mediaPool, 'preload');
    await page.layoutCallback();

    page.setState(PageState.PLAYING);

    await nextTick();

    const audioEl = scopedQuerySelectorAll(
      element,
      Selectors.ALL_PLAYBACK_MEDIA
    )[0];
    expect(mediaPoolPreload).to.have.been.calledOnceWithExactly(audioEl);
  });

  it('should wait for media layoutCallback to register it', async () => {
    const ampVideoEl = win.document.createElement('amp-video');
    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp4');

    const deferred = new Deferred();
    ampVideoEl.signals = () => ({
      signal: () => {},
      whenSignal: () => deferred.promise,
    });

    ampVideoEl.appendChild(videoEl);
    gridLayerEl.appendChild(ampVideoEl);

    page.buildCallback();
    const mediaPool = await page.mediaPoolPromise_;
    const mediaPoolRegister = env.sandbox.spy(mediaPool, 'register');
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    deferred.resolve();
    await nextTick();

    expect(mediaPoolRegister).to.have.been.calledOnceWithExactly(videoEl);
  });

  it('should not register media before its layoutCallback resolves', async () => {
    const ampVideoEl = win.document.createElement('amp-video');
    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp4');

    const deferred = new Deferred();
    ampVideoEl.signals = () => ({
      signal: () => {},
      whenSignal: () => deferred.promise,
    });

    ampVideoEl.appendChild(videoEl);
    gridLayerEl.appendChild(ampVideoEl);

    page.buildCallback();
    const mediaPool = await page.mediaPoolPromise_;
    const mediaPoolRegister = env.sandbox.spy(mediaPool, 'register');
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    // Not calling deferred.resolve();

    await nextTick();

    expect(mediaPoolRegister).to.not.have.been.called;
  });

  it('should use storyNextUp value as default for auto-advance-after', async () => {
    env.sandbox
      .stub(Services.viewerForDoc(element), 'getParam')
      .withArgs('storyNextUp')
      .returns('5s');
    expect(element.getAttribute('auto-advance-after')).to.be.equal(null);
    page.buildCallback();

    expect(element.getAttribute('auto-advance-after')).to.be.equal('5s');
  });

  it('should not use storyNextUp to override auto-advance-after value', async () => {
    env.sandbox
      .stub(Services.viewerForDoc(element), 'getParam')
      .withArgs('storyNextUp')
      .returns('5s');
    element.setAttribute('auto-advance-after', '20000ms');
    page.buildCallback();

    expect(element.getAttribute('auto-advance-after')).to.be.equal('20000ms');
  });

  it('should not use storyNextUp when in viewer control group', () => {
    env.sandbox
      .stub(Services.viewerForDoc(element), 'getParam')
      .withArgs('storyNextUp')
      .returns('999999ms');
    page.buildCallback();
    expect(element).not.to.have.attribute('auto-advance-after');
  });

  it('should stop the advancement when state becomes not active', async () => {
    page.buildCallback();
    const advancementStopStub = env.sandbox.stub(page.advancement_, 'stop');
    await page.layoutCallback();
    page.setState(PageState.NOT_ACTIVE);

    expect(advancementStopStub).to.have.been.calledOnce;
  });

  it('should stop the animations when state becomes not active', async () => {
    const animatedEl = html`<div animate-in="fade-in"></div>`;
    element.appendChild(animatedEl);

    page.buildCallback();
    await page.layoutCallback();
    const cancelAllStub = env.sandbox.stub(page.animationManager_, 'cancelAll');

    page.setState(PageState.NOT_ACTIVE);

    expect(cancelAllStub).to.have.been.calledOnce;
  });

  it('should pause/rewind media when state becomes not active', (done) => {
    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp3');
    gridLayerEl.appendChild(videoEl);

    let mediaPoolMock;

    page.buildCallback();
    page
      .layoutCallback()
      .then(() => page.mediaPoolPromise_)
      .then(async (mediaPool) => {
        mediaPoolMock = env.sandbox.mock(mediaPool);
        mediaPoolMock
          .expects('pause')
          .withExactArgs(videoEl, true /** rewindToBeginning */)
          .once();

        page.setState(PageState.NOT_ACTIVE);

        // `setState` runs code that creates subtasks (Promise callbacks).
        // Waits for the next frame to make sure all the subtasks are
        // already executed when we run the assertions.
        await afterRenderPromise();
        mediaPoolMock.verify();
        done();
      });
  });

  it('should mute audio when state becomes active', (done) => {
    storeService.dispatch(Action.TOGGLE_MUTED, false);

    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp3');
    gridLayerEl.appendChild(videoEl);

    let mediaPoolMock;

    page.buildCallback();
    page
      .layoutCallback()
      .then(() => page.mediaPoolPromise_)
      .then(async (mediaPool) => {
        mediaPoolMock = env.sandbox.mock(mediaPool);
        mediaPoolMock.expects('mute').withExactArgs(videoEl).once();

        page.setState(PageState.NOT_ACTIVE);

        await afterRenderPromise();
        mediaPoolMock.verify();
        done();
      });
  });

  it('should stop the advancement when state becomes paused', async () => {
    page.buildCallback();
    const advancementStopStub = env.sandbox.stub(page.advancement_, 'stop');
    await page.layoutCallback();
    page.setState(PageState.PAUSED);

    expect(advancementStopStub).to.have.been.calledOnce;
  });

  it('should pause media when state becomes paused', (done) => {
    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp3');
    gridLayerEl.appendChild(videoEl);

    let mediaPoolMock;

    page.buildCallback();
    page
      .layoutCallback()
      .then(() => page.mediaPoolPromise_)
      .then(async (mediaPool) => {
        mediaPoolMock = env.sandbox.mock(mediaPool);
        mediaPoolMock
          .expects('pause')
          .withExactArgs(videoEl, false /** rewindToBeginning */)
          .once();

        page.setState(PageState.PAUSED);

        // `setState` runs code that creates subtasks (Promise callbacks).
        // Waits for the next frame to make sure all the subtasks are
        // already executed when we run the assertions.
        await afterRenderPromise();
        mediaPoolMock.verify();
        done();
      });
  });

  it('should find pageIds in a goToPage action', async () => {
    const actionButton = createElementWithAttributes(win.document, 'button', {
      'id': 'actionButton',
      'on': 'tap:story.goToPage(id=pageId)',
    });
    element.appendChild(actionButton);
    page.buildCallback();

    await page.layoutCallback();
    const actions = page.actions_();

    expect(actions.length).to.be.equal(1);
    expect(actions[0]).to.be.equal('pageId');
  });

  it('should find pageIds in a goToPage action with multiple actions', async () => {
    const multipleActionButton = createElementWithAttributes(
      win.document,
      'button',
      {
        'id': 'actionButton',
        'on': 'tap:story.goToPage(id=pageId),foo.bar(baz=quux)',
      }
    );
    element.appendChild(multipleActionButton);
    page.buildCallback();

    await page.layoutCallback();
    const actions = page.actions_();

    expect(actions.length).to.be.equal(1);
    expect(actions[0]).to.be.equal('pageId');
  });

  it('should find pageIds in a goToPage action with multiple events', async () => {
    const multipleEventsButton = createElementWithAttributes(
      win.document,
      'button',
      {
        'id': 'actionButton',
        'on': 'tap:story.goToPage(id=pageId);action:foo.bar(baz=quux',
      }
    );
    element.appendChild(multipleEventsButton);
    page.buildCallback();

    await page.layoutCallback();
    const actions = page.actions_();

    expect(actions.length).to.be.equal(1);
    expect(actions[0]).to.be.equal('pageId');
  });

  it('play message should have role="button" to prevent story page navigation', async () => {
    env.sandbox.stub(page, 'loadPromise').returns(Promise.resolve());
    env.sandbox.stub(VideoUtils, 'isAutoplaySupported').resolves(false);
    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp4');
    gridLayerEl.appendChild(videoEl);

    page.buildCallback();
    const mediaPool = await page.mediaPoolPromise_;
    const mediaPoolPlay = env.sandbox.stub(mediaPool, 'play');
    mediaPoolPlay.returns(Promise.reject());

    page.layoutCallback();

    page.setState(PageState.PLAYING);
    await nextTick();

    const playButtonEl = element.querySelector(
      '.i-amphtml-story-page-play-button'
    );

    expect(playButtonEl.getAttribute('role')).to.eql('button');
  });

  it('should not build the open attachment UI if no attachment', async () => {
    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );
    expect(openAttachmentEl).to.not.exist;
  });

  it('should build the open attachment UI if attachment', async () => {
    const attachmentEl = win.document.createElement(
      'amp-story-page-attachment'
    );
    attachmentEl.setAttribute('layout', 'nodisplay');
    element.appendChild(attachmentEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );
    expect(openAttachmentEl).to.exist;
  });

  it('should build the legacy outlinking amp-story-page-attachment UI with target="_top" to navigate in top window. For viewers, this ensures the link will open in the parent window.', async () => {
    const attachmentEl = win.document.createElement(
      'amp-story-page-attachment'
    );
    attachmentEl.setAttribute('layout', 'nodisplay');
    attachmentEl.setAttribute('href', 'google.com');
    element.appendChild(attachmentEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );

    expect(openAttachmentEl.getAttribute('target')).to.eql('_top');
  });

  it('should build amp-story-page-outlink UI with target="_top" to navigate in top level browsing context. For viewers, this ensures the link will open in the parent window.', async () => {
    const outlinkEl = win.document.createElement('amp-story-page-outlink');
    outlinkEl.setAttribute('layout', 'nodisplay');
    element.appendChild(outlinkEl);
    const anchorEl = win.document.createElement('a');
    outlinkEl.appendChild(anchorEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );

    expect(openAttachmentEl.getAttribute('target')).to.eql('_top');
  });

  it('should build the open outlink UI with same codepath as page attachment', async () => {
    const outlinkEl = win.document.createElement('amp-story-page-outlink');
    outlinkEl.setAttribute('layout', 'nodisplay');
    element.appendChild(outlinkEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openoutlinkEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );
    expect(openoutlinkEl).to.exist;
  });

  it('should build the amp-story-page-attachment UI with one image', async () => {
    const attachmentEl = win.document.createElement(
      'amp-story-page-attachment'
    );

    attachmentEl.setAttribute('layout', 'nodisplay');
    attachmentEl.setAttribute('cta-image', 'nodisplay');
    element.appendChild(attachmentEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );

    expect(
      openAttachmentEl.querySelector(
        '.i-amphtml-story-inline-page-attachment-img'
      )
    ).to.exist;
  });

  it('should build the amp-story-page-attachment UI with two images', async () => {
    const attachmentEl = win.document.createElement(
      'amp-story-page-attachment'
    );
    attachmentEl.setAttribute('layout', 'nodisplay');
    attachmentEl.setAttribute('cta-image', 'nodisplay');
    attachmentEl.setAttribute('cta-image-2', 'nodisplay');
    element.appendChild(attachmentEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );

    expect(
      openAttachmentEl.querySelectorAll(
        '.i-amphtml-story-inline-page-attachment-img'
      ).length
    ).to.equal(2);
  });

  it('should NOT rewrite the amp-story-page-attachment UI images to a proxy URL', async () => {
    const attachmentEl = win.document.createElement(
      'amp-story-page-attachment'
    );

    const src = 'https://examples.com/foo.bar.png';
    attachmentEl.setAttribute('layout', 'nodisplay');
    attachmentEl.setAttribute('cta-image', src);
    element.appendChild(attachmentEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );

    const imgEl = openAttachmentEl.querySelector(
      '.i-amphtml-story-inline-page-attachment-img'
    );
    expect(imgEl.getAttribute('style')).to.contain(src);
  });

  it('should build the amp-story-page-attachment with href (legacy) UI', async () => {
    const attachmentEl = win.document.createElement(
      'amp-story-page-attachment'
    );
    attachmentEl.setAttribute('layout', 'nodisplay');
    attachmentEl.setAttribute('href', 'www.google.com');
    element.appendChild(attachmentEl);

    await page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );

    expect(
      openAttachmentEl.querySelector(
        '.i-amphtml-story-page-open-attachment-link-icon'
      )
    ).to.exist;
  });

  it('should build the amp-story-page-outlink UI', async () => {
    const outlinkEl = win.document.createElement('amp-story-page-outlink');
    outlinkEl.setAttribute('layout', 'nodisplay');
    element.appendChild(outlinkEl);
    const anchorChild = win.document.createElement('a');
    outlinkEl.appendChild(anchorChild);

    await page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );

    expect(
      openAttachmentEl.querySelector(
        '.i-amphtml-story-page-open-attachment-link-icon'
      )
    ).to.exist;
  });

  it('should build the open attachment UI with custom text', async () => {
    const attachmentEl = win.document.createElement(
      'amp-story-page-attachment'
    );
    attachmentEl.setAttribute('layout', 'nodisplay');
    attachmentEl.setAttribute('cta-text', 'Custom text');
    element.appendChild(attachmentEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentLabelEl = element.querySelector(
      '.i-amphtml-story-page-attachment-label'
    );
    expect(openAttachmentLabelEl.textContent).to.equal('Custom text');
  });

  it('should use cta-text attribute when data-cta-text also exist', async () => {
    const attachmentEl = win.document.createElement(
      'amp-story-page-attachment'
    );
    attachmentEl.setAttribute('layout', 'nodisplay');
    attachmentEl.setAttribute('cta-text', 'CTA text');
    attachmentEl.setAttribute('data-cta-text', 'data CTA text');
    element.appendChild(attachmentEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentLabelEl = element.querySelector(
      '.i-amphtml-story-page-attachment-label'
    );

    expect(openAttachmentLabelEl.textContent).to.equal('CTA text');
  });

  it('should propogate the amp-story-page-attachment title attribute to the cta button', async () => {
    const attachmentEl = win.document.createElement('amp-story-page-outlink');
    attachmentEl.setAttribute('layout', 'nodisplay');
    attachmentEl.setAttribute('title', 'cta title');
    element.appendChild(attachmentEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );

    expect(openAttachmentEl.getAttribute('title')).to.equal('cta title');
  });

  it('should propogate the amp-story-page-outlink title attribute to the cta button', async () => {
    const outlinkEl = win.document.createElement('amp-story-page-outlink');
    outlinkEl.setAttribute('layout', 'nodisplay');
    element.appendChild(outlinkEl);

    const anchorChild = win.document.createElement('a');
    anchorChild.setAttribute('href', 'google.com');
    anchorChild.setAttribute('title', 'cta title');
    outlinkEl.appendChild(anchorChild);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    const openAttachmentEl = element.querySelector(
      '.i-amphtml-story-page-open-attachment'
    );

    expect(openAttachmentEl.getAttribute('title')).to.equal('cta title');
  });

  it('should start tracking media performance when entering the page', async () => {
    expectAsyncConsoleError(/source must start with/, 1);

    isPerformanceTrackingOn = true;
    const startMeasuringStub = env.sandbox.stub(
      page.mediaPerformanceMetricsService_,
      'startMeasuring'
    );

    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'localhost/video.mp4');
    gridLayerEl.appendChild(videoEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    await nextTick();

    const poolVideoEl = element.querySelector('video');
    // Not called with the original video.
    expect(startMeasuringStub).to.not.have.been.calledOnceWithExactly(videoEl);
    // Called with the media pool replaced video.
    expect(startMeasuringStub).to.have.been.calledOnceWithExactly(poolVideoEl);
  });

  it('should stop tracking media performance when leaving the page', async () => {
    expectAsyncConsoleError(/source must start with/, 1);

    isPerformanceTrackingOn = true;
    const stopMeasuringStub = env.sandbox.stub(
      page.mediaPerformanceMetricsService_,
      'stopMeasuring'
    );

    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp4');
    gridLayerEl.appendChild(videoEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);
    await nextTick();
    page.setState(PageState.NOT_ACTIVE);

    const poolVideoEl = element.querySelector('video');
    expect(stopMeasuringStub).to.have.been.calledOnceWithExactly(
      poolVideoEl,
      true /* sendMetrics */
    );
  });

  it('should not start tracking media performance if tracking is off', async () => {
    expectAsyncConsoleError(/source must start with/, 1);

    isPerformanceTrackingOn = false;
    const startMeasuringStub = env.sandbox.stub(
      page.mediaPerformanceMetricsService_,
      'startMeasuring'
    );

    const videoEl = win.document.createElement('video');
    videoEl.setAttribute('src', 'https://example.com/video.mp4');
    gridLayerEl.appendChild(videoEl);

    page.buildCallback();
    await page.layoutCallback();
    page.setState(PageState.PLAYING);

    expect(startMeasuringStub).to.not.have.been.called;
  });
});

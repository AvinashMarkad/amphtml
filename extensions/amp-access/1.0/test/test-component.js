import * as Preact from '#preact';
import {BentoAccess} from '../component';
import {mount} from 'enzyme';

describes.sandboxed('BentoAccess preact component v1.0', {}, (env) => {
  // DO NOT SUBMIT: This is example code only.
  it('should render', () => {
    const wrapper = mount(<BentoAccess testProp={true} />);

    const component = wrapper.find(BentoAccess.name);
    expect(component).to.have.lengthOf(1);
    expect(component.prop('testProp')).to.be.true;
  });
});
